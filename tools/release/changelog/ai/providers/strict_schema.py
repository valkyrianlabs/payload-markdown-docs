"""Make stage JSON schemas acceptable to strict structured-output modes.

OpenAI and DeepSeek strict `json_schema` require every object property to be listed in `required` (with
`additionalProperties: false`). Our contracts keep some fields optional, which made strict requests fail with
HTTP 400 ("Required properties must match all properties in the object") and pushed the pipeline into the
weaker `json_object` mode, where enums are not enforced. The transport sends a strict-compatible copy of the
schema (optional properties required but nullable) and strips the resulting `null` placeholders before the
stage contracts validate the result, so contracts keep seeing optional fields as absent.
"""
from __future__ import annotations

import copy
from typing import Any


def to_strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    return _strictify(copy.deepcopy(schema))


def drop_null_optionals(value: Any, schema: dict[str, Any]) -> Any:
    """Remove `null` values the model produced for properties the original schema left optional."""
    if isinstance(value, dict) and isinstance(schema, dict):
        properties = schema.get("properties") if isinstance(schema.get("properties"), dict) else {}
        required = set(schema.get("required") or [])
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            if item is None and key in properties and key not in required:
                continue
            cleaned[key] = drop_null_optionals(item, properties.get(key, {})) if key in properties else item
        return cleaned
    if isinstance(value, list) and isinstance(schema, dict) and isinstance(schema.get("items"), dict):
        return [drop_null_optionals(item, schema["items"]) for item in value]
    return value


_SCALAR_TYPES = {"string", "number", "integer", "boolean", "null"}


def _strictify(node: Any) -> Any:
    if isinstance(node, list):
        return [_strictify(item) for item in node]
    if not isinstance(node, dict):
        return node

    node_type = node.get("type")
    if isinstance(node_type, list) and not set(node_type) <= _SCALAR_TYPES:
        # DeepSeek only accepts scalar members in a `type` list; split e.g. ["array", "null"] into anyOf branches.
        base = {key: value for key, value in node.items() if key != "type"}
        return {"anyOf": [_strictify({**base, "type": t}) if t != "null" else {"type": "null"} for t in node_type]}

    for key in ("items", "anyOf", "oneOf", "allOf", "$defs", "definitions"):
        if key in node:
            if isinstance(node[key], dict) and key in ("$defs", "definitions"):
                node[key] = {name: _strictify(sub) for name, sub in node[key].items()}
            else:
                node[key] = _strictify(node[key])

    properties = node.get("properties")
    if isinstance(properties, dict):
        required = set(node.get("required") or [])
        strict_properties: dict[str, Any] = {}
        for name, sub in properties.items():
            sub = _strictify(sub)
            if name not in required:
                sub = _nullable(sub)
            strict_properties[name] = sub
        node["properties"] = strict_properties
        node["required"] = list(strict_properties.keys())
        node["additionalProperties"] = False
    return node


def _nullable(sub: Any) -> Any:
    # `anyOf` with a null branch, not a `type` list: DeepSeek strict mode rejects `type: ["array", "null"]`.
    if not isinstance(sub, dict):
        return sub
    sub_type = sub.get("type")
    if sub_type == "null" or (isinstance(sub_type, list) and "null" in sub_type):
        return sub
    if any(isinstance(branch, dict) and branch.get("type") == "null" for branch in sub.get("anyOf", [])):
        return sub
    return {"anyOf": [sub, {"type": "null"}]}
