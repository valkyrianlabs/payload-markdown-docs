#include "pmdocs/docs.hpp"

#include "pmdocs_config.hpp"

#include <curl/curl.h>
#include <nlohmann/json.hpp>
#include <openssl/bio.h>
#include <openssl/buffer.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/rand.h>
#include <openssl/x509.h>

#include <algorithm>
#include <array>
#include <bit>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iterator>
#include <limits>
#include <map>
#include <memory>
#include <optional>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <system_error>
#include <utility>
#include <vector>

namespace pmdocs {
namespace {

using json = nlohmann::ordered_json;

constexpr std::size_t kDefaultMaxFileBytes = 500'000;
constexpr std::size_t kDefaultMaxFiles = 500;
constexpr std::size_t kDefaultMaxTotalBytes = 5'000'000;
constexpr std::string_view kMissingAssetRoutesWarning =
  "Assets were included in the manifest, but public asset route files were not found.\n"
  "Run:\n"
  "payload-markdown-docs install routes --payload-app \"src/app/(payload)\"\n"
  "Without these route files, public /llms.txt and /skills routes will 404 outside /api.\n";

struct BioDeleter {
  void operator()(BIO* bio) const {
    BIO_free(bio);
  }
};

struct EvpPkeyDeleter {
  void operator()(EVP_PKEY* key) const {
    EVP_PKEY_free(key);
  }
};

struct EvpPkeyCtxDeleter {
  void operator()(EVP_PKEY_CTX* context) const {
    EVP_PKEY_CTX_free(context);
  }
};

struct EvpMdCtxDeleter {
  void operator()(EVP_MD_CTX* context) const {
    EVP_MD_CTX_free(context);
  }
};

struct Pkcs8Deleter {
  void operator()(PKCS8_PRIV_KEY_INFO* info) const {
    PKCS8_PRIV_KEY_INFO_free(info);
  }
};

struct CurlSlistDeleter {
  void operator()(curl_slist* list) const {
    curl_slist_free_all(list);
  }
};

struct CurlUrlDeleter {
  void operator()(CURLU* url) const {
    curl_url_cleanup(url);
  }
};

using BioPtr = std::unique_ptr<BIO, BioDeleter>;
using EvpPkeyPtr = std::unique_ptr<EVP_PKEY, EvpPkeyDeleter>;
using EvpPkeyCtxPtr = std::unique_ptr<EVP_PKEY_CTX, EvpPkeyCtxDeleter>;
using EvpMdCtxPtr = std::unique_ptr<EVP_MD_CTX, EvpMdCtxDeleter>;
using Pkcs8Ptr = std::unique_ptr<PKCS8_PRIV_KEY_INFO, Pkcs8Deleter>;
using CurlSlistPtr = std::unique_ptr<curl_slist, CurlSlistDeleter>;
using CurlUrlPtr = std::unique_ptr<CURLU, CurlUrlDeleter>;

void ensure_curl_initialized() {
  static const bool initialized = []() {
    const auto code = curl_global_init(CURL_GLOBAL_DEFAULT);
    if (code != CURLE_OK) {
      throw std::runtime_error{"Could not initialize HTTP client."};
    }
    std::atexit(curl_global_cleanup);
    return true;
  }();

  (void)initialized;
}

struct Issue {
  std::string code;
  std::string message;
  std::optional<std::string> path;
};

struct NormalizedPath {
  bool ok = false;
  std::string path;
  std::vector<std::string> route_segments;
  std::string code;
  std::string message;
};

struct NormalizedAssetPath {
  bool ok = false;
  std::string path;
  std::vector<std::string> segments;
  std::string code;
  std::string message;
};

struct Frontmatter {
  std::vector<std::string> dependencies;
  bool has_dependencies = false;
  std::optional<std::string> description;
  std::optional<bool> draft;
  std::optional<std::string> nav_title;
  std::optional<double> order;
  std::vector<std::string> redirect_from;
  bool has_redirect_from = false;
  std::optional<std::string> slug;
  std::optional<std::string> status;
  std::vector<std::string> tags;
  bool has_tags = false;
  std::optional<std::string> title;
};

struct ParsedFrontmatter {
  std::string content;
  Frontmatter frontmatter;
  std::vector<Issue> issues;
  std::vector<Issue> warnings;
};

struct WalkedDocsFile {
  std::string content;
  std::string path;
};

struct PackageAsset {
  std::string content;
  std::string content_type;
  std::string kind;
  std::string path;
  std::optional<std::string> route;
};

struct PublishPackageSummary {
  std::size_t assets = 0;
  std::size_t docs = 0;
  std::string llms = "missing";
  std::string llms_full = "missing";
  std::size_t skills = 0;
};

struct PublishPackage {
  std::vector<PackageAsset> assets;
  std::vector<WalkedDocsFile> files;
  PublishPackageSummary summary;
};

struct ValidatedFile {
  std::string content;
  Frontmatter frontmatter;
  std::string path;
  std::string route;
  std::string sha256;
  std::string title;
};

struct ValidatedAsset {
  std::string content;
  std::string content_type;
  std::string kind;
  std::string path;
  std::optional<std::string> route;
  std::string sha256;
};

struct ValidationResult {
  std::vector<ValidatedAsset> assets;
  std::string delete_behavior = "archive";
  std::vector<ValidatedFile> files;
  bool mode_dry_run = true;
  bool ok = false;
  bool publish = false;
  std::string source_id;
  std::optional<std::string> source_branch;
  std::optional<std::string> source_commit;
  std::optional<std::string> source_repository;
  std::vector<Issue> issues;
  std::vector<Issue> warnings;
};

struct ExistingRecord {
  std::optional<bool> archived;
  std::string route;
  std::optional<std::string> source_hash;
  std::string source_path;
  std::optional<std::string> status;
  std::optional<std::string> title;
};

struct PlannedChange {
  std::optional<ExistingRecord> current;
  std::optional<ValidatedFile> desired;
  std::string reason;
  std::string source_path;
};

struct Plan {
  std::vector<PlannedChange> archive;
  std::vector<PlannedChange> create;
  std::vector<PlannedChange> delete_items;
  std::vector<PlannedChange> draft;
  std::vector<PlannedChange> unchanged;
  std::vector<PlannedChange> update;
  std::vector<Issue> warnings;
};

struct ExistingAssetRecord {
  std::optional<bool> archived;
  std::string content_type;
  std::string kind;
  std::optional<std::string> route;
  std::optional<std::string> source_hash;
  std::string source_path;
};

struct PlannedAssetChange {
  std::optional<ExistingAssetRecord> current;
  std::optional<ValidatedAsset> desired;
  std::string reason;
  std::string source_path;
};

struct AssetPlan {
  std::vector<PlannedAssetChange> archive;
  std::vector<PlannedAssetChange> create;
  std::vector<PlannedAssetChange> delete_items;
  std::vector<PlannedAssetChange> unchanged;
  std::vector<PlannedAssetChange> update;
  std::vector<Issue> warnings;
};

struct HttpResponse {
  json body;
  bool has_json = false;
  bool ok = false;
  long status = 0;
  std::string text;
};

class OpenSshBufferReader {
public:
  explicit OpenSshBufferReader(std::vector<unsigned char> bytes)
    : bytes_{std::move(bytes)}
  {}

  explicit OpenSshBufferReader(std::string bytes)
    : bytes_{bytes.begin(), bytes.end()}
  {}

  std::vector<unsigned char> read_bytes(std::size_t length) {
    if (bytes_.size() - offset_ < length) {
      throw std::runtime_error{"OpenSSH key data is truncated."};
    }

    std::vector<unsigned char> out(bytes_.begin() + static_cast<std::ptrdiff_t>(offset_), bytes_.begin() + static_cast<std::ptrdiff_t>(offset_ + length));
    offset_ += length;
    return out;
  }

  std::string read_string() {
    const auto length = read_u32();
    const auto bytes = read_bytes(length);
    return std::string{bytes.begin(), bytes.end()};
  }

  std::uint32_t read_u32() {
    if (bytes_.size() - offset_ < 4) {
      throw std::runtime_error{"OpenSSH key data is truncated."};
    }

    const auto value =
      (static_cast<std::uint32_t>(bytes_[offset_]) << 24U)
      | (static_cast<std::uint32_t>(bytes_[offset_ + 1]) << 16U)
      | (static_cast<std::uint32_t>(bytes_[offset_ + 2]) << 8U)
      | static_cast<std::uint32_t>(bytes_[offset_ + 3]);
    offset_ += 4;
    return value;
  }

private:
  std::vector<unsigned char> bytes_;
  std::size_t offset_ = 0;
};

std::string read_file(const std::filesystem::path& path) {
  std::ifstream input{path, std::ios::binary};

  if (!input) {
    throw std::runtime_error{"Could not read file: " + path.string()};
  }

  std::ostringstream out;
  out << input.rdbuf();

  return out.str();
}

void write_file(const std::filesystem::path& path, std::string_view content) {
  std::ofstream output{path, std::ios::binary | std::ios::trunc};
  if (!output) {
    throw std::runtime_error{"Could not write file: " + path.string()};
  }

  output.write(content.data(), static_cast<std::streamsize>(content.size()));
  if (!output) {
    throw std::runtime_error{"Could not finish writing file: " + path.string()};
  }
}

std::string trim(std::string_view value) {
  const auto first = value.find_first_not_of(" \t\r\n");

  if (first == std::string_view::npos) {
    return {};
  }

  const auto last = value.find_last_not_of(" \t\r\n");

  return std::string{value.substr(first, last - first + 1)};
}

bool starts_with(std::string_view value, std::string_view prefix) {
  return value.substr(0, prefix.size()) == prefix;
}

bool ends_with(std::string_view value, std::string_view suffix) {
  return value.size() >= suffix.size() && value.substr(value.size() - suffix.size()) == suffix;
}

std::string normalize_base64(std::string_view value) {
  std::string normalized;
  normalized.reserve(value.size());

  for (const auto ch : value) {
    if (!std::isspace(static_cast<unsigned char>(ch))) {
      normalized.push_back(ch);
    }
  }

  return normalized;
}

std::string base64_encode(const unsigned char* data, std::size_t size) {
  if (size > static_cast<std::size_t>(std::numeric_limits<int>::max() / 4 * 3)) {
    throw std::runtime_error{"Data is too large to base64 encode."};
  }

  std::string output(((size + 2) / 3) * 4, '\0');
  const auto written = EVP_EncodeBlock(
    reinterpret_cast<unsigned char*>(output.data()),
    data,
    static_cast<int>(size)
  );

  if (written < 0) {
    throw std::runtime_error{"Could not base64 encode data."};
  }

  output.resize(static_cast<std::size_t>(written));
  return output;
}

std::vector<unsigned char> base64_decode(std::string_view value) {
  const auto normalized = normalize_base64(value);

  if (normalized.empty() || normalized.size() % 4 != 0) {
    throw std::runtime_error{"Invalid base64 data."};
  }

  std::vector<unsigned char> output((normalized.size() / 4) * 3);
  const auto decoded = EVP_DecodeBlock(
    output.data(),
    reinterpret_cast<const unsigned char*>(normalized.data()),
    static_cast<int>(normalized.size())
  );

  if (decoded < 0) {
    throw std::runtime_error{"Invalid base64 data."};
  }

  auto padding = 0U;
  if (!normalized.empty() && normalized.back() == '=') {
    ++padding;
  }
  if (normalized.size() >= 2 && normalized[normalized.size() - 2] == '=') {
    ++padding;
  }

  output.resize(static_cast<std::size_t>(decoded) - padding);
  return output;
}

std::string bio_to_string(BIO* bio) {
  BUF_MEM* memory = nullptr;
  BIO_get_mem_ptr(bio, &memory);

  if (memory == nullptr || memory->data == nullptr) {
    return {};
  }

  return std::string{memory->data, memory->length};
}

std::string private_key_to_pem(EVP_PKEY* key) {
  BioPtr bio{BIO_new(BIO_s_mem())};
  if (!bio || PEM_write_bio_PrivateKey(bio.get(), key, nullptr, nullptr, 0, nullptr, nullptr) != 1) {
    throw std::runtime_error{"Could not encode private key PEM."};
  }

  return bio_to_string(bio.get());
}

std::string public_key_to_pem(EVP_PKEY* key) {
  BioPtr bio{BIO_new(BIO_s_mem())};
  if (!bio || PEM_write_bio_PUBKEY(bio.get(), key) != 1) {
    throw std::runtime_error{"Could not encode public key PEM."};
  }

  return bio_to_string(bio.get());
}

std::vector<unsigned char> private_key_to_pkcs8_der(EVP_PKEY* key) {
  Pkcs8Ptr info{EVP_PKEY2PKCS8(key)};
  if (!info) {
    throw std::runtime_error{"Could not convert private key to PKCS#8."};
  }

  const auto length = i2d_PKCS8_PRIV_KEY_INFO(info.get(), nullptr);
  if (length <= 0) {
    throw std::runtime_error{"Could not size private key DER."};
  }

  std::vector<unsigned char> der(static_cast<std::size_t>(length));
  auto* cursor = der.data();
  if (i2d_PKCS8_PRIV_KEY_INFO(info.get(), &cursor) != length) {
    throw std::runtime_error{"Could not encode private key DER."};
  }

  return der;
}

std::vector<unsigned char> public_key_to_spki_der(EVP_PKEY* key) {
  const auto length = i2d_PUBKEY(key, nullptr);
  if (length <= 0) {
    throw std::runtime_error{"Could not size public key DER."};
  }

  std::vector<unsigned char> der(static_cast<std::size_t>(length));
  auto* cursor = der.data();
  if (i2d_PUBKEY(key, &cursor) != length) {
    throw std::runtime_error{"Could not encode public key DER."};
  }

  return der;
}

EvpPkeyPtr generate_ed25519_evp_key() {
  EvpPkeyCtxPtr context{EVP_PKEY_CTX_new_id(EVP_PKEY_ED25519, nullptr)};
  if (!context || EVP_PKEY_keygen_init(context.get()) <= 0) {
    throw std::runtime_error{"Could not initialize Ed25519 key generation."};
  }

  EVP_PKEY* raw_key = nullptr;
  if (EVP_PKEY_keygen(context.get(), &raw_key) <= 0 || raw_key == nullptr) {
    throw std::runtime_error{"Could not generate Ed25519 key pair."};
  }

  return EvpPkeyPtr{raw_key};
}

void ensure_ed25519_private_key(EVP_PKEY* key) {
  if (key == nullptr || EVP_PKEY_base_id(key) != EVP_PKEY_ED25519) {
    throw std::runtime_error{
      "Private key must be an Ed25519 PKCS#8 PEM key, base64 PKCS#8 DER key, or unencrypted OpenSSH Ed25519 private key."
    };
  }
}

EvpPkeyPtr read_pem_private_key(const std::string& private_key) {
  BioPtr bio{BIO_new_mem_buf(private_key.data(), static_cast<int>(private_key.size()))};
  if (!bio) {
    throw std::runtime_error{"Could not read private key."};
  }

  EVP_PKEY* raw_key = PEM_read_bio_PrivateKey(bio.get(), nullptr, nullptr, nullptr);
  EvpPkeyPtr key{raw_key};
  ensure_ed25519_private_key(key.get());
  return key;
}

EvpPkeyPtr read_der_private_key(const std::vector<unsigned char>& der) {
  const unsigned char* cursor = der.data();
  EVP_PKEY* raw_key = d2i_AutoPrivateKey(nullptr, &cursor, static_cast<long>(der.size()));
  EvpPkeyPtr key{raw_key};
  ensure_ed25519_private_key(key.get());
  return key;
}

std::string extract_pem_body(const std::string& input, std::string_view begin_marker, std::string_view end_marker) {
  const auto begin = input.find(begin_marker);
  const auto end = input.find(end_marker);

  if (begin == std::string::npos || end == std::string::npos || end <= begin) {
    throw std::runtime_error{"OpenSSH private key PEM is invalid."};
  }

  return input.substr(begin + begin_marker.size(), end - (begin + begin_marker.size()));
}

EvpPkeyPtr read_openssh_private_key(const std::string& private_key) {
  static constexpr std::string_view begin_marker = "-----BEGIN OPENSSH PRIVATE KEY-----";
  static constexpr std::string_view end_marker = "-----END OPENSSH PRIVATE KEY-----";
  const auto data = base64_decode(extract_pem_body(private_key, begin_marker, end_marker));
  const std::string magic{"openssh-key-v1\0", 15};

  if (data.size() < magic.size() || std::string{data.begin(), data.begin() + static_cast<std::ptrdiff_t>(magic.size())} != magic) {
    throw std::runtime_error{"OpenSSH private key magic header is invalid."};
  }

  std::vector<unsigned char> remainder(data.begin() + static_cast<std::ptrdiff_t>(magic.size()), data.end());
  OpenSshBufferReader reader{std::move(remainder)};
  const auto cipher_name = reader.read_string();
  const auto kdf_name = reader.read_string();
  reader.read_string();

  if (cipher_name != "none" || kdf_name != "none") {
    throw std::runtime_error{
      "Encrypted OpenSSH private keys are not supported. Use `pmdocs keygen --out .docs-sync` or provide an unencrypted PKCS#8 PEM Ed25519 private key."
    };
  }

  if (reader.read_u32() != 1U) {
    throw std::runtime_error{"OpenSSH private key must contain exactly one key."};
  }

  reader.read_string();
  OpenSshBufferReader private_reader{reader.read_string()};
  const auto check = private_reader.read_u32();
  const auto repeated_check = private_reader.read_u32();

  if (check != repeated_check) {
    throw std::runtime_error{"OpenSSH private key check values do not match."};
  }

  if (private_reader.read_string() != "ssh-ed25519") {
    throw std::runtime_error{"Only Ed25519 private keys are supported for docs sync signing."};
  }

  const auto public_key = private_reader.read_string();
  const auto private_bytes_string = private_reader.read_string();
  const std::vector<unsigned char> private_bytes(private_bytes_string.begin(), private_bytes_string.end());

  if (public_key.size() != 32 || private_bytes.size() != 64) {
    throw std::runtime_error{"OpenSSH Ed25519 private key payload is invalid."};
  }

  const std::vector<unsigned char> public_bytes(public_key.begin(), public_key.end());
  if (!std::equal(public_bytes.begin(), public_bytes.end(), private_bytes.begin() + 32)) {
    throw std::runtime_error{"OpenSSH Ed25519 private/public key data does not match."};
  }

  EVP_PKEY* raw_key = EVP_PKEY_new_raw_private_key(EVP_PKEY_ED25519, nullptr, private_bytes.data(), 32);
  EvpPkeyPtr key{raw_key};
  ensure_ed25519_private_key(key.get());
  return key;
}

EvpPkeyPtr read_ed25519_private_key(const std::string& private_key) {
  const auto trimmed = trim(private_key);

  try {
    if (trimmed.find("BEGIN OPENSSH PRIVATE KEY") != std::string::npos) {
      return read_openssh_private_key(trimmed);
    }

    if (trimmed.find("BEGIN") != std::string::npos) {
      return read_pem_private_key(trimmed);
    }

    return read_der_private_key(base64_decode(trimmed));
  } catch (const std::runtime_error& error) {
    const std::string message = error.what();
    if (message.find("Private key must be an Ed25519") != std::string::npos
        || message.find("OpenSSH") != std::string::npos
        || message.find("Only Ed25519") != std::string::npos
        || message.find("Encrypted OpenSSH") != std::string::npos) {
      throw;
    }

    throw std::runtime_error{
      "Private key must be an Ed25519 PKCS#8 PEM key, base64 PKCS#8 DER key, or unencrypted OpenSSH Ed25519 private key."
    };
  }
}

std::string sign_ed25519_base64(EVP_PKEY* key, std::string_view content) {
  EvpMdCtxPtr context{EVP_MD_CTX_new()};
  if (!context || EVP_DigestSignInit(context.get(), nullptr, nullptr, nullptr, key) <= 0) {
    throw std::runtime_error{"Could not initialize Ed25519 signing."};
  }

  std::size_t signature_size = 0;
  if (EVP_DigestSign(context.get(), nullptr, &signature_size, reinterpret_cast<const unsigned char*>(content.data()), content.size()) <= 0) {
    throw std::runtime_error{"Could not size Ed25519 signature."};
  }

  std::vector<unsigned char> signature(signature_size);
  if (EVP_DigestSign(context.get(), signature.data(), &signature_size, reinterpret_cast<const unsigned char*>(content.data()), content.size()) <= 0) {
    throw std::runtime_error{"Could not sign request."};
  }

  signature.resize(signature_size);
  return base64_encode(signature.data(), signature.size());
}

std::string random_uuid_v4() {
  std::array<unsigned char, 16> bytes = {};
  if (RAND_bytes(bytes.data(), static_cast<int>(bytes.size())) != 1) {
    throw std::runtime_error{"Could not generate request nonce."};
  }

  bytes[6] = static_cast<unsigned char>((bytes[6] & 0x0fU) | 0x40U);
  bytes[8] = static_cast<unsigned char>((bytes[8] & 0x3fU) | 0x80U);

  std::ostringstream out;
  out << std::hex << std::setfill('0');
  for (std::size_t index = 0; index < bytes.size(); ++index) {
    if (index == 4 || index == 6 || index == 8 || index == 10) {
      out << '-';
    }
    out << std::setw(2) << static_cast<int>(bytes[index]);
  }

  return out.str();
}

std::string current_iso_timestamp() {
  const auto now = std::chrono::system_clock::now();
  const auto seconds = std::chrono::time_point_cast<std::chrono::seconds>(now);
  const auto millis = std::chrono::duration_cast<std::chrono::milliseconds>(now - seconds).count();
  const auto time = std::chrono::system_clock::to_time_t(seconds);
  std::tm utc = {};

#if defined(_WIN32)
  gmtime_s(&utc, &time);
#else
  gmtime_r(&time, &utc);
#endif

  std::ostringstream out;
  out << std::put_time(&utc, "%Y-%m-%dT%H:%M:%S");
  out << '.' << std::setw(3) << std::setfill('0') << millis << 'Z';
  return out.str();
}

std::string normalize_canonical_path(std::string path) {
  path = trim(path);
  path = "/" + path;

  std::string normalized;
  normalized.reserve(path.size());
  bool previous_slash = false;

  for (const auto ch : path) {
    if (ch == '/') {
      if (!previous_slash) {
        normalized.push_back(ch);
      }
      previous_slash = true;
      continue;
    }

    previous_slash = false;
    normalized.push_back(ch);
  }

  while (normalized.size() > 1 && normalized.back() == '/') {
    normalized.pop_back();
  }

  return normalized.empty() ? "/" : normalized;
}

std::string curl_error_message(CURLUcode code) {
  return curl_url_strerror(code);
}

std::string get_endpoint_path(const std::string& endpoint) {
  ensure_curl_initialized();
  CurlUrlPtr url{curl_url()};
  if (!url) {
    throw std::runtime_error{"Could not initialize URL parser."};
  }

  if (const auto code = curl_url_set(url.get(), CURLUPART_URL, endpoint.c_str(), 0); code != CURLUE_OK) {
    throw std::runtime_error{"--endpoint must be a valid full http:// or https:// URL."};
  }

  char* path = nullptr;
  const auto code = curl_url_get(url.get(), CURLUPART_PATH, &path, 0);
  if (code != CURLUE_OK || path == nullptr) {
    if (path != nullptr) {
      curl_free(path);
    }
    return "/";
  }

  std::string output = path;
  curl_free(path);
  return output.empty() ? "/" : output;
}

std::string validate_endpoint_url(const std::string& endpoint) {
  ensure_curl_initialized();
  CurlUrlPtr url{curl_url()};
  if (!url) {
    throw std::runtime_error{"Could not initialize URL parser."};
  }

  if (const auto code = curl_url_set(url.get(), CURLUPART_URL, endpoint.c_str(), 0); code != CURLUE_OK) {
    throw std::runtime_error{"--endpoint must be a valid full http:// or https:// URL."};
  }

  char* scheme = nullptr;
  if (const auto code = curl_url_get(url.get(), CURLUPART_SCHEME, &scheme, 0); code != CURLUE_OK || scheme == nullptr) {
    if (scheme != nullptr) {
      curl_free(scheme);
    }
    throw std::runtime_error{"--endpoint must be a full http:// or https:// URL."};
  }

  const std::string scheme_value = scheme;
  curl_free(scheme);
  if (scheme_value != "http" && scheme_value != "https") {
    throw std::runtime_error{"--endpoint must be a full http:// or https:// URL."};
  }

  char* host = nullptr;
  if (const auto code = curl_url_get(url.get(), CURLUPART_HOST, &host, 0); code != CURLUE_OK || host == nullptr || std::string{host}.empty()) {
    if (host != nullptr) {
      curl_free(host);
    }
    throw std::runtime_error{"--endpoint must be a full http:// or https:// URL."};
  }
  curl_free(host);

  char* normalized = nullptr;
  if (const auto code = curl_url_get(url.get(), CURLUPART_URL, &normalized, 0); code != CURLUE_OK || normalized == nullptr) {
    if (normalized != nullptr) {
      curl_free(normalized);
    }
    throw std::runtime_error{"Could not normalize endpoint URL: " + curl_error_message(code)};
  }

  std::string output = normalized;
  curl_free(normalized);
  return output;
}

std::size_t append_curl_response(char* ptr, std::size_t size, std::size_t nmemb, void* userdata) {
  auto* output = static_cast<std::string*>(userdata);
  output->append(ptr, size * nmemb);
  return size * nmemb;
}

HttpResponse parse_http_response(long status, std::string text) {
  HttpResponse response;
  response.ok = status >= 200 && status < 300;
  response.status = status;
  response.text = std::move(text);

  if (!trim(response.text).empty()) {
    try {
      response.body = json::parse(response.text);
      response.has_json = true;
    } catch (const json::parse_error&) {
      response.body = nullptr;
    }
  } else {
    response.body = nullptr;
  }

  return response;
}

HttpResponse curl_json_request(const std::string& method, const std::string& url, const std::map<std::string, std::string>& headers, const std::optional<std::string>& body = std::nullopt) {
  ensure_curl_initialized();
  CURL* curl = curl_easy_init();
  if (curl == nullptr) {
    throw std::runtime_error{"Could not initialize HTTP client."};
  }

  std::string response_text;
  curl_slist* raw_headers = nullptr;
  for (const auto& [name, value] : headers) {
    const auto header = name + ": " + value;
    auto* next_headers = curl_slist_append(raw_headers, header.c_str());
    if (next_headers == nullptr) {
      curl_slist_free_all(raw_headers);
      curl_easy_cleanup(curl);
      throw std::runtime_error{"Could not prepare HTTP headers."};
    }
    raw_headers = next_headers;
  }
  CurlSlistPtr header_list{raw_headers};

  curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 0L);
  curl_easy_setopt(curl, CURLOPT_CONNECTTIMEOUT, 10L);
  curl_easy_setopt(curl, CURLOPT_TIMEOUT, 300L);
  curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, append_curl_response);
  curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response_text);
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, header_list.get());
  const auto user_agent = std::string{"pmdocs/"} + PMDOCS_VERSION;
  curl_easy_setopt(curl, CURLOPT_USERAGENT, user_agent.c_str());

  std::string request_body_storage;
  if (method == "POST") {
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
    request_body_storage = body.value_or("");
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, request_body_storage.data());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, static_cast<long>(request_body_storage.size()));
  } else if (method == "GET") {
    curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
  } else {
    curl_easy_cleanup(curl);
    throw std::runtime_error{"Unsupported HTTP method: " + method};
  }

  const auto code = curl_easy_perform(curl);
  long status = 0;
  curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, &status);
  curl_easy_cleanup(curl);

  if (code != CURLE_OK) {
    throw std::runtime_error{"HTTP request failed: " + std::string{curl_easy_strerror(code)}};
  }

  return parse_http_response(status, std::move(response_text));
}

std::string trim_response_text(const std::string& text) {
  auto trimmed = trim(text);
  if (trimmed.size() <= 1000) {
    return trimmed;
  }

  return trimmed.substr(0, 1000) + "...";
}

std::string format_server_failure(const HttpResponse& response) {
  if (response.has_json && response.body.is_object()) {
    if (response.body.contains("error") && response.body["error"].is_object()
        && response.body["error"].contains("message") && response.body["error"]["message"].is_string()) {
      return response.body["error"]["message"].get<std::string>() + "\n";
    }

    if (response.body.contains("errors") && response.body["errors"].is_array()) {
      std::vector<std::string> messages;
      for (const auto& error : response.body["errors"]) {
        if (error.is_object() && error.contains("message") && error["message"].is_string()) {
          messages.push_back(error["message"].get<std::string>());
        }
      }

      if (!messages.empty()) {
        std::ostringstream out;
        out << "Sync request failed with HTTP status " << response.status << ".\n\n";
        for (const auto& message : messages) {
          out << "- " << message << "\n";
        }
        return out.str();
      }
    }
  }

  const auto text = trim_response_text(response.text);
  if (!text.empty()) {
    std::ostringstream out;
    out << "Sync request failed with HTTP status " << response.status << ".\n\n";
    out << "Response body:\n" << text << "\n";
    return out.str();
  }

  return "Sync request failed with HTTP status " + std::to_string(response.status) + ".\n";
}

std::string url_encode_query_value(const std::string& value) {
  ensure_curl_initialized();
  CURL* curl = curl_easy_init();
  if (curl == nullptr) {
    throw std::runtime_error{"Could not initialize URL encoder."};
  }
  char* encoded = curl_easy_escape(curl, value.c_str(), static_cast<int>(value.size()));
  if (encoded == nullptr) {
    curl_easy_cleanup(curl);
    throw std::runtime_error{"Could not encode OIDC audience."};
  }

  std::string output = encoded;
  curl_free(encoded);
  curl_easy_cleanup(curl);
  return output;
}

void validate_github_oidc_request_url(const std::string& request_url) {
  ensure_curl_initialized();
  CurlUrlPtr url{curl_url()};
  if (!url) {
    throw std::runtime_error{"Could not initialize URL parser."};
  }

  if (curl_url_set(url.get(), CURLUPART_URL, request_url.c_str(), 0) != CURLUE_OK) {
    throw std::runtime_error{"ACTIONS_ID_TOKEN_REQUEST_URL is not a valid URL."};
  }

  char* scheme = nullptr;
  if (curl_url_get(url.get(), CURLUPART_SCHEME, &scheme, 0) != CURLUE_OK || scheme == nullptr) {
    if (scheme != nullptr) {
      curl_free(scheme);
    }
    throw std::runtime_error{"ACTIONS_ID_TOKEN_REQUEST_URL is not a valid URL."};
  }

  const std::string scheme_value = scheme;
  curl_free(scheme);
  if (scheme_value != "http" && scheme_value != "https") {
    throw std::runtime_error{"ACTIONS_ID_TOKEN_REQUEST_URL is not a valid URL."};
  }

  char* host = nullptr;
  if (curl_url_get(url.get(), CURLUPART_HOST, &host, 0) != CURLUE_OK || host == nullptr || std::string{host}.empty()) {
    if (host != nullptr) {
      curl_free(host);
    }
    throw std::runtime_error{"ACTIONS_ID_TOKEN_REQUEST_URL is not a valid URL."};
  }
  curl_free(host);
}

std::string add_audience_query_param(const std::string& request_url, const std::string& audience) {
  validate_github_oidc_request_url(request_url);

  const auto fragment_offset = request_url.find('#');
  const auto base = request_url.substr(0, fragment_offset);
  const auto fragment = fragment_offset == std::string::npos ? std::string{} : request_url.substr(fragment_offset);
  const auto separator = base.find('?') == std::string::npos ? '?' : '&';
  return base + separator + "audience=" + url_encode_query_value(audience) + fragment;
}

std::string read_github_oidc_token(const PushCommandOptions& options, const std::string& source_id) {
  if (options.oidc_token_env) {
    const auto* value = std::getenv(options.oidc_token_env->c_str());
    if (value == nullptr || *value == '\0') {
      throw std::runtime_error{"Environment variable \"" + *options.oidc_token_env + "\" is not set."};
    }

    return value;
  }

  const auto* request_url = std::getenv("ACTIONS_ID_TOKEN_REQUEST_URL");
  const auto* request_token = std::getenv("ACTIONS_ID_TOKEN_REQUEST_TOKEN");
  if (request_url == nullptr || *request_url == '\0' || request_token == nullptr || *request_token == '\0') {
    throw std::runtime_error{
      "GitHub OIDC push requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN, or --oidc-token-env."
    };
  }

  const auto token_url = add_audience_query_param(request_url, source_id);
  const auto response = curl_json_request("GET", token_url, {{"Authorization", std::string{"bearer "} + request_token}});
  if (!response.ok || !response.has_json || !response.body.is_object() || !response.body.contains("value") || !response.body["value"].is_string()) {
    throw std::runtime_error{"Could not retrieve GitHub OIDC token. HTTP status " + std::to_string(response.status) + "."};
  }

  return response.body["value"].get<std::string>();
}

bool path_exists(const std::filesystem::path& path);

bool has_public_asset_routes() {
  static const std::array<std::filesystem::path, 3> candidates = {
    std::filesystem::path{"src/app/(payload)"},
    std::filesystem::path{"app/(payload)"},
    std::filesystem::path{"dev/app/(payload)"},
  };
  static const std::array<std::filesystem::path, 9> required = {
    std::filesystem::path{"payloadMarkdownDocsAssetRoute.ts"},
    std::filesystem::path{"llms.txt/route.ts"},
    std::filesystem::path{"llms-full.txt/route.ts"},
    std::filesystem::path{"plugins/[docsSetSlug]/llms.txt/route.ts"},
    std::filesystem::path{"plugins/[docsSetSlug]/llms-full.txt/route.ts"},
    std::filesystem::path{"plugins/[docsSetSlug]/skills/[agent]/[[...assetPath]]/route.ts"},
    std::filesystem::path{"[docsSetSlug]/llms.txt/route.ts"},
    std::filesystem::path{"[docsSetSlug]/llms-full.txt/route.ts"},
    std::filesystem::path{"[docsSetSlug]/skills/[agent]/[[...assetPath]]/route.ts"},
  };

  for (const auto& candidate : candidates) {
    bool all_found = true;
    for (const auto& file : required) {
      if (!path_exists(candidate / file)) {
        all_found = false;
        break;
      }
    }

    if (all_found) {
      return true;
    }
  }

  return false;
}

std::vector<std::string> split_lines(std::string_view input) {
  std::vector<std::string> lines;
  std::string normalized;
  normalized.reserve(input.size());

  for (std::size_t index = 0; index < input.size(); ++index) {
    const auto ch = input[index];

    if (ch == '\r') {
      if (index + 1 < input.size() && input[index + 1] == '\n') {
        continue;
      }

      normalized.push_back('\n');
      continue;
    }

    normalized.push_back(ch);
  }

  std::string current;

  for (const auto ch : normalized) {
    if (ch == '\n') {
      lines.push_back(current);
      current.clear();
      continue;
    }

    current.push_back(ch);
  }

  lines.push_back(current);

  return lines;
}

std::string join_lines(const std::vector<std::string>& lines, std::size_t start) {
  std::ostringstream out;

  for (std::size_t index = start; index < lines.size(); ++index) {
    if (index > start) {
      out << '\n';
    }

    out << lines[index];
  }

  auto content = out.str();

  if (starts_with(content, "\n")) {
    content.erase(0, 1);
  }

  return content;
}

std::string strip_quotes(std::string_view value) {
  auto stripped = trim(value);

  if (stripped.size() >= 2) {
    const auto first = stripped.front();
    const auto last = stripped.back();

    if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
      stripped = stripped.substr(1, stripped.size() - 2);
    }
  }

  return stripped;
}

std::vector<std::string> split_path(std::string_view path) {
  std::vector<std::string> segments;
  std::string current;

  for (const auto ch : path) {
    if (ch == '/') {
      segments.push_back(current);
      current.clear();
      continue;
    }

    current.push_back(ch);
  }

  segments.push_back(current);

  return segments;
}

std::string normalize_slashes(std::string value) {
  for (auto& ch : value) {
    if (ch == '\\') {
      ch = '/';
    }
  }

  std::string normalized;
  normalized.reserve(value.size());
  bool previous_slash = false;

  for (const auto ch : value) {
    if (ch == '/') {
      if (!previous_slash) {
        normalized.push_back(ch);
      }

      previous_slash = true;
      continue;
    }

    previous_slash = false;
    normalized.push_back(ch);
  }

  return normalized;
}

NormalizedPath normalize_docs_path(std::string_view input) {
  if (trim(input).empty()) {
    return {
      .code = "invalid_path",
      .message = "Docs path must be a non-empty string.",
    };
  }

  auto normalized = normalize_slashes(trim(input));

  if (normalized.size() >= 3 && std::isalpha(static_cast<unsigned char>(normalized[0])) && normalized[1] == ':' && normalized[2] == '/') {
    return {
      .code = "invalid_path",
      .message = "Docs path must not be an absolute Windows path.",
    };
  }

  if (starts_with(normalized, "/")) {
    return {
      .code = "invalid_path",
      .message = "Docs path must not be an absolute path.",
    };
  }

  while (starts_with(normalized, "./")) {
    normalized.erase(0, 2);
  }

  if (normalized.empty() || ends_with(normalized, "/")) {
    return {
      .code = "invalid_path",
      .message = "Docs path must point to a Markdown file.",
    };
  }

  const auto segments = split_path(normalized);

  for (const auto& segment : segments) {
    if (segment == "..") {
      return {
        .code = "path_traversal",
        .message = "Docs path must not contain path traversal segments.",
      };
    }

    if (segment.empty() || segment == ".") {
      return {
        .code = "invalid_path",
        .message = "Docs path contains an invalid path segment.",
      };
    }
  }

  if (!ends_with(normalized, ".md")) {
    return {
      .code = "non_markdown_file",
      .message = "Docs path must end in .md.",
    };
  }

  const auto& file_name = segments.back();

  if (file_name == ".md") {
    return {
      .code = "invalid_path",
      .message = "Docs path must include a Markdown filename.",
    };
  }

  auto route_segments = segments;
  route_segments.back() = route_segments.back().substr(0, route_segments.back().size() - 3);

  if (!route_segments.empty() && route_segments.back() == "index") {
    route_segments.pop_back();
  }

  return {
    .ok = true,
    .path = normalized,
    .route_segments = route_segments,
  };
}

NormalizedAssetPath normalize_asset_path(std::string_view input) {
  if (trim(input).empty()) {
    return {
      .code = "invalid_path",
      .message = "Asset path must be a non-empty string.",
    };
  }

  auto normalized = normalize_slashes(trim(input));

  if (normalized.size() >= 3 && std::isalpha(static_cast<unsigned char>(normalized[0])) && normalized[1] == ':' && normalized[2] == '/') {
    return {
      .code = "invalid_path",
      .message = "Asset path must not be an absolute Windows path.",
    };
  }

  if (starts_with(normalized, "/")) {
    return {
      .code = "invalid_path",
      .message = "Asset path must not be an absolute path.",
    };
  }

  while (starts_with(normalized, "./")) {
    normalized.erase(0, 2);
  }

  if (normalized.empty() || ends_with(normalized, "/")) {
    return {
      .code = "invalid_path",
      .message = "Asset path must point to a file.",
    };
  }

  const auto segments = split_path(normalized);

  for (const auto& segment : segments) {
    if (segment == "..") {
      return {
        .code = "path_traversal",
        .message = "Asset path must not contain path traversal segments.",
      };
    }

    if (segment.empty() || segment == ".") {
      return {
        .code = "invalid_path",
        .message = "Asset path contains an invalid path segment.",
      };
    }
  }

  return {
    .ok = true,
    .path = normalized,
    .segments = segments,
  };
}

std::string normalize_route_base(std::string route_base) {
  route_base = normalize_slashes(trim(route_base));
  route_base = "/" + route_base;
  route_base = normalize_slashes(route_base);

  while (route_base.size() > 1 && route_base.back() == '/') {
    route_base.pop_back();
  }

  return route_base.empty() ? "/" : route_base;
}

std::string normalize_route_path(std::string route_path) {
  return normalize_route_base(std::move(route_path));
}

std::string join_route_paths(const std::vector<std::string>& segments) {
  std::ostringstream joined;

  for (const auto& segment : segments) {
    if (trim(segment).empty()) {
      continue;
    }

    if (joined.tellp() > 0) {
      joined << '/';
    }

    joined << trim(segment);
  }

  return normalize_route_path(joined.str());
}

std::string derive_route_from_source_path(const std::string& source_path, const std::string& route_base, const std::optional<std::string>& slug) {
  const auto normalized_path = normalize_docs_path(source_path);
  const auto normalized_route_base = normalize_route_base(route_base);

  if (!normalized_path.ok) {
    return normalized_route_base;
  }

  auto route_segments = normalized_path.route_segments;
  auto base_segments = split_path(normalized_route_base.substr(1));

  if (base_segments.size() == 1 && base_segments.front().empty()) {
    base_segments.clear();
  }

  if (base_segments.size() <= route_segments.size()) {
    bool has_base_prefix = true;

    for (std::size_t index = 0; index < base_segments.size(); ++index) {
      if (route_segments[index] != base_segments[index]) {
        has_base_prefix = false;
        break;
      }
    }

    if (has_base_prefix) {
      route_segments.erase(route_segments.begin(), route_segments.begin() + static_cast<std::ptrdiff_t>(base_segments.size()));
    }
  }

  const auto is_index_source_path = !split_path(normalized_path.path).empty() && split_path(normalized_path.path).back() == "index.md";
  const auto should_apply_slug = slug && !slug->empty() && !(is_index_source_path && *slug == "index");

  if (should_apply_slug) {
    if (!route_segments.empty()) {
      route_segments.back() = *slug;
    } else {
      route_segments.push_back(*slug);
    }
  }

  if (route_segments.empty()) {
    return normalized_route_base;
  }

  std::ostringstream suffix;

  for (std::size_t index = 0; index < route_segments.size(); ++index) {
    if (index > 0) {
      suffix << '/';
    }

    suffix << route_segments[index];
  }

  return normalize_slashes(normalized_route_base + "/" + suffix.str());
}

std::optional<std::string> derive_asset_route_from_source_path(
  const std::string& kind,
  const std::optional<std::string>& route,
  const std::string& route_base,
  const std::string& source_id,
  const std::string& source_path
) {
  if (route && !trim(*route).empty()) {
    return normalize_route_path(*route);
  }

  if (kind == "llms") {
    return "/llms.txt";
  }

  if (kind == "llms-full") {
    return "/llms-full.txt";
  }

  if (kind != "skill" || source_id.empty()) {
    return std::nullopt;
  }

  const auto expected_prefix = "skills/" + source_id + "/";

  if (!starts_with(source_path, expected_prefix)) {
    return std::nullopt;
  }

  const auto skill_path = source_path.substr(expected_prefix.size());

  if (skill_path.empty()) {
    return std::nullopt;
  }

  return join_route_paths({route_base, "skills", skill_path});
}

Issue issue(std::string code, std::string message, std::optional<std::string> path = std::nullopt) {
  return {
    .code = std::move(code),
    .message = std::move(message),
    .path = std::move(path),
  };
}

json issue_to_json(const Issue& item) {
  json output = {
    {"code", item.code},
    {"message", item.message},
  };

  if (item.path) {
    output["path"] = *item.path;
  }

  return output;
}

json issues_to_json(const std::vector<Issue>& issues) {
  json output = json::array();

  for (const auto& item : issues) {
    output.push_back(issue_to_json(item));
  }

  return output;
}

std::string format_issue(const Issue& item) {
  if (item.path) {
    return "- " + *item.path + ": " + item.message;
  }

  return "- " + item.message;
}

std::string format_issues(const std::vector<Issue>& issues) {
  std::ostringstream out;

  for (std::size_t index = 0; index < issues.size(); ++index) {
    if (index > 0) {
      out << '\n';
    }

    out << format_issue(issues[index]);
  }

  return out.str();
}

bool is_frontmatter_key(std::string_view value) {
  if (value.empty() || !std::isalpha(static_cast<unsigned char>(value.front()))) {
    return false;
  }

  return std::ranges::all_of(value, [](const auto ch) {
    return std::isalnum(static_cast<unsigned char>(ch));
  });
}

std::optional<Issue> assign_frontmatter_value(Frontmatter& frontmatter, const std::string& key, const std::string& raw_value, const std::optional<std::string>& path) {
  const auto value = strip_quotes(raw_value);

  if (key == "description") {
    frontmatter.description = value;
    return std::nullopt;
  }

  if (key == "navTitle") {
    frontmatter.nav_title = value;
    return std::nullopt;
  }

  if (key == "slug") {
    frontmatter.slug = value;
    return std::nullopt;
  }

  if (key == "title") {
    frontmatter.title = value;
    return std::nullopt;
  }

  if (key == "draft") {
    if (value == "true" || value == "false") {
      frontmatter.draft = value == "true";
      return std::nullopt;
    }

    return issue("invalid_frontmatter", "Frontmatter field \"draft\" must be a boolean.", path);
  }

  if (key == "order") {
    try {
      std::size_t consumed = 0;
      const auto parsed = std::stod(value, &consumed);

      if (consumed == value.size() && std::isfinite(parsed)) {
        frontmatter.order = parsed;
        return std::nullopt;
      }
    } catch (...) {
    }

    return issue("invalid_frontmatter", "Frontmatter field \"order\" must be a number.", path);
  }

  if (key == "status") {
    if (value == "draft" || value == "published") {
      frontmatter.status = value;
      return std::nullopt;
    }

    return issue("invalid_frontmatter", "Frontmatter field \"status\" must be \"draft\" or \"published\".", path);
  }

  return std::nullopt;
}

std::vector<Issue> validate_frontmatter(const Frontmatter& frontmatter, const std::optional<std::string>& path) {
  std::vector<Issue> issues;

  if (frontmatter.slug) {
    const auto& slug = *frontmatter.slug;
    const auto valid = !slug.empty() && std::ranges::all_of(slug, [](const auto ch) {
      return std::isalnum(static_cast<unsigned char>(ch)) || ch == '-';
    });

    if (!valid || !std::isalnum(static_cast<unsigned char>(slug.front()))) {
      issues.push_back(issue("invalid_frontmatter", "Frontmatter field \"slug\" must contain only letters, numbers, and hyphens.", path));
    }
  }

  return issues;
}

ParsedFrontmatter parse_frontmatter(const std::string& markdown, std::optional<std::string> path = std::nullopt) {
  ParsedFrontmatter result;
  result.content = markdown;

  if (!starts_with(markdown, "---\n") && !starts_with(markdown, "---\r\n")) {
    return result;
  }

  const auto lines = split_lines(markdown);
  std::optional<std::size_t> closing_index;

  for (std::size_t index = 1; index < lines.size(); ++index) {
    if (trim(lines[index]) == "---") {
      closing_index = index;
      break;
    }
  }

  if (!closing_index) {
    result.issues.push_back(issue("invalid_frontmatter", "Frontmatter block is missing a closing delimiter.", path));
    return result;
  }

  std::optional<std::string> current_array_key;
  static const std::set<std::string> known_fields = {
    "dependencies",
    "description",
    "draft",
    "navTitle",
    "order",
    "redirectFrom",
    "slug",
    "status",
    "tags",
    "title",
  };
  static const std::set<std::string> array_fields = {"dependencies", "redirectFrom", "tags"};

  for (std::size_t index = 1; index < *closing_index; ++index) {
    const auto& line = lines[index];

    if (trim(line).empty()) {
      continue;
    }

    auto trimmed_start = line;
    trimmed_start.erase(trimmed_start.begin(), std::ranges::find_if(trimmed_start, [](const auto ch) {
      return !std::isspace(static_cast<unsigned char>(ch));
    }));

    if (starts_with(trimmed_start, "- ")) {
      if (!current_array_key) {
        result.issues.push_back(issue("invalid_frontmatter", "Frontmatter array item does not belong to a supported array field.", path));
        continue;
      }

      if (*current_array_key == "dependencies") {
        result.frontmatter.dependencies.push_back(strip_quotes(trimmed_start.substr(2)));
      } else if (*current_array_key == "redirectFrom") {
        result.frontmatter.redirect_from.push_back(strip_quotes(trimmed_start.substr(2)));
      } else if (*current_array_key == "tags") {
        result.frontmatter.tags.push_back(strip_quotes(trimmed_start.substr(2)));
      }

      continue;
    }

    const auto separator = line.find(':');
    const auto key = separator == std::string::npos ? std::string{} : trim(std::string_view{line}.substr(0, separator));
    const auto raw_value = separator == std::string::npos ? std::string{} : trim(std::string_view{line}.substr(separator + 1));

    if (!is_frontmatter_key(key)) {
      result.issues.push_back(issue("invalid_frontmatter", "Unsupported frontmatter line: " + line, path));
      current_array_key.reset();
      continue;
    }

    current_array_key.reset();

    if (!known_fields.contains(key)) {
      result.warnings.push_back(issue("invalid_frontmatter", "Unknown frontmatter field \"" + key + "\" was ignored.", path));
      continue;
    }

    if (array_fields.contains(key)) {
      if (!trim(raw_value).empty()) {
        result.issues.push_back(issue("invalid_frontmatter", "Frontmatter field \"" + key + "\" must use list item syntax.", path));
        continue;
      }

      current_array_key = key;

      if (key == "dependencies") {
        result.frontmatter.has_dependencies = true;
        result.frontmatter.dependencies.clear();
      } else if (key == "redirectFrom") {
        result.frontmatter.has_redirect_from = true;
        result.frontmatter.redirect_from.clear();
      } else {
        result.frontmatter.has_tags = true;
        result.frontmatter.tags.clear();
      }

      continue;
    }

    if (auto field_issue = assign_frontmatter_value(result.frontmatter, key, raw_value, path)) {
      result.issues.push_back(std::move(*field_issue));
    }
  }

  auto more_issues = validate_frontmatter(result.frontmatter, path);
  result.issues.insert(result.issues.end(), more_issues.begin(), more_issues.end());
  result.content = join_lines(lines, *closing_index + 1);

  return result;
}

std::optional<std::string> infer_title_from_markdown(const std::string& content) {
  for (const auto& line : split_lines(content)) {
    const auto trimmed = trim(line);

    if (starts_with(trimmed, "# ") && !starts_with(trimmed, "##")) {
      auto title = trim(std::string_view{trimmed}.substr(2));

      while (!title.empty() && title.back() == '#') {
        title.pop_back();
      }

      title = trim(title);

      if (!title.empty()) {
        return title;
      }
    }
  }

  return std::nullopt;
}

std::string title_from_source_path(const std::string& source_path) {
  const auto normalized = normalize_docs_path(source_path);

  if (!normalized.ok) {
    return "Untitled";
  }

  const auto segments = split_path(normalized.path);
  auto base = segments.back() == "index.md" && segments.size() > 1 ? segments[segments.size() - 2] : segments.back();

  if (ends_with(base, ".md")) {
    base.resize(base.size() - 3);
  }

  std::ostringstream title;
  std::string part;
  bool first = true;

  const auto flush = [&]() {
    if (part.empty()) {
      return;
    }

    if (!first) {
      title << ' ';
    }

    part[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(part[0])));
    title << part;
    first = false;
    part.clear();
  };

  for (const auto ch : base) {
    if (ch == '-' || ch == '_' || std::isspace(static_cast<unsigned char>(ch))) {
      flush();
      continue;
    }

    part.push_back(ch);
  }

  flush();

  auto output = title.str();
  return output.empty() ? "Untitled" : output;
}

std::string resolve_title(const ParsedFrontmatter& parsed, const std::string& source_path) {
  if (parsed.frontmatter.title) {
    return *parsed.frontmatter.title;
  }

  if (const auto inferred = infer_title_from_markdown(parsed.content)) {
    return *inferred;
  }

  return title_from_source_path(source_path);
}

json frontmatter_to_json(const Frontmatter& frontmatter) {
  json output = json::object();

  if (frontmatter.has_dependencies) {
    output["dependencies"] = frontmatter.dependencies;
  }
  if (frontmatter.description) {
    output["description"] = *frontmatter.description;
  }
  if (frontmatter.draft) {
    output["draft"] = *frontmatter.draft;
  }
  if (frontmatter.nav_title) {
    output["navTitle"] = *frontmatter.nav_title;
  }
  if (frontmatter.order) {
    output["order"] = *frontmatter.order;
  }
  if (frontmatter.has_redirect_from) {
    output["redirectFrom"] = frontmatter.redirect_from;
  }
  if (frontmatter.slug) {
    output["slug"] = *frontmatter.slug;
  }
  if (frontmatter.status) {
    output["status"] = *frontmatter.status;
  }
  if (frontmatter.has_tags) {
    output["tags"] = frontmatter.tags;
  }
  if (frontmatter.title) {
    output["title"] = *frontmatter.title;
  }

  return output;
}

std::string json_string(const json& value, bool pretty) {
  return value.dump(pretty ? 2 : -1) + "\n";
}

std::string get_repository_name() {
  const auto* repository = std::getenv("GITHUB_REPOSITORY");

  if (repository == nullptr || *repository == '\0') {
    return {};
  }

  const std::string value{repository};
  const auto slash = value.find('/');

  if (slash == std::string::npos) {
    return value;
  }

  return value.substr(slash + 1);
}

std::string default_source_id(const std::filesystem::path& docs_root) {
  if (const auto repository = get_repository_name(); !repository.empty()) {
    return repository;
  }

  const auto name = std::filesystem::absolute(docs_root).filename().string();

  return name == "docs" ? "local-docs" : name;
}

std::filesystem::path effective_docs_root(const DocsCommandOptions& options) {
  return options.docs_flag.value_or(options.docs_root);
}

bool effective_docs_root_explicit(const DocsCommandOptions& options) {
  return options.docs_flag.has_value() || options.docs_root_explicit;
}

std::string source_id_for(const DocsCommandOptions& options) {
  if (options.source_id && !options.source_id->empty()) {
    return *options.source_id;
  }

  return default_source_id(effective_docs_root(options));
}

std::string lower_copy(std::string value);

std::vector<WalkedDocsFile> walk_docs_files(const std::filesystem::path& root) {
  static const std::set<std::string> ignored_directories = {".git", ".next", "build", "dist", "node_modules"};
  const auto absolute_root = std::filesystem::absolute(root).lexically_normal();
  std::error_code error;

  if (!std::filesystem::is_directory(absolute_root, error)) {
    throw std::runtime_error{"Docs root is not a directory: " + root.string()};
  }

  std::vector<WalkedDocsFile> files;
  std::filesystem::recursive_directory_iterator iterator{absolute_root, error};
  const std::filesystem::recursive_directory_iterator end;

  if (error) {
    throw std::runtime_error{"Could not read docs root: " + error.message()};
  }

  for (; iterator != end; iterator.increment(error)) {
    if (error) {
      throw std::runtime_error{"Could not walk docs root: " + error.message()};
    }

    const auto& entry = *iterator;
    const auto status = entry.symlink_status(error);

    if (error) {
      throw std::runtime_error{"Could not inspect docs entry: " + error.message()};
    }

    if (std::filesystem::is_symlink(status)) {
      if (std::filesystem::is_directory(entry.path(), error)) {
        iterator.disable_recursion_pending();
      }

      continue;
    }

    if (std::filesystem::is_directory(status)) {
      if (ignored_directories.contains(entry.path().filename().string())) {
        iterator.disable_recursion_pending();
      }

      continue;
    }

    if (!std::filesystem::is_regular_file(status) || entry.path().extension() != ".md") {
      continue;
    }

    auto relative = std::filesystem::relative(entry.path(), absolute_root, error);

    if (error) {
      throw std::runtime_error{"Could not compute docs relative path: " + error.message()};
    }

    const auto normalized = normalize_docs_path(relative.generic_string());

    if (!normalized.ok) {
      throw std::runtime_error{normalized.message};
    }

    files.push_back({
      .content = read_file(entry.path()),
      .path = normalized.path,
    });
  }

  std::ranges::sort(files, [](const auto& left, const auto& right) {
    const auto left_path = lower_copy(left.path);
    const auto right_path = lower_copy(right.path);

    return left_path == right_path ? left.path < right.path : left_path < right_path;
  });

  return files;
}

bool path_exists(const std::filesystem::path& path) {
  std::error_code error;
  return std::filesystem::exists(path, error);
}

std::string lower_copy(std::string value) {
  std::ranges::transform(value, value.begin(), [](const auto ch) {
    return static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  });

  return value;
}

std::string asset_content_type(const std::string& asset_path) {
  const auto extension = lower_copy(std::filesystem::path{asset_path}.extension().string());

  if (extension == ".md") {
    return "text/markdown; charset=utf-8";
  }

  if (extension == ".json") {
    return "application/json; charset=utf-8";
  }

  if (extension == ".yaml" || extension == ".yml") {
    return "application/yaml; charset=utf-8";
  }

  return "text/plain; charset=utf-8";
}

std::vector<PackageAsset> walk_skill_files(const std::filesystem::path& root, const std::string& source_id) {
  static const std::set<std::string> ignored_directories = {".git", ".next", "build", "dist", "node_modules"};
  static const std::set<std::string> allowed_extensions = {".json", ".md", ".txt", ".yaml", ".yml"};
  const auto absolute_root = std::filesystem::absolute(root).lexically_normal();
  const auto skill_package_root = absolute_root / source_id;
  std::error_code error;

  if (!std::filesystem::exists(skill_package_root, error)) {
    return {};
  }

  if (!std::filesystem::is_directory(skill_package_root, error)) {
    return {};
  }

  std::vector<PackageAsset> files;
  std::filesystem::recursive_directory_iterator iterator{skill_package_root, error};
  const std::filesystem::recursive_directory_iterator end;

  if (error) {
    throw std::runtime_error{"Could not read skills root: " + error.message()};
  }

  for (; iterator != end; iterator.increment(error)) {
    if (error) {
      throw std::runtime_error{"Could not walk skills root: " + error.message()};
    }

    const auto& entry = *iterator;
    const auto status = entry.symlink_status(error);

    if (error) {
      throw std::runtime_error{"Could not inspect skill entry: " + error.message()};
    }

    if (std::filesystem::is_symlink(status)) {
      if (std::filesystem::is_directory(entry.path(), error)) {
        iterator.disable_recursion_pending();
      }

      continue;
    }

    if (std::filesystem::is_directory(status)) {
      if (ignored_directories.contains(entry.path().filename().string())) {
        iterator.disable_recursion_pending();
      }

      continue;
    }

    if (!std::filesystem::is_regular_file(status) || !allowed_extensions.contains(lower_copy(entry.path().extension().string()))) {
      continue;
    }

    auto relative = std::filesystem::relative(entry.path(), absolute_root, error);

    if (error) {
      throw std::runtime_error{"Could not compute skill relative path: " + error.message()};
    }

    const auto normalized = normalize_asset_path("skills/" + relative.generic_string());

    if (!normalized.ok) {
      throw std::runtime_error{normalized.message};
    }

    files.push_back({
      .content = read_file(entry.path()),
      .content_type = asset_content_type(normalized.path),
      .kind = "skill",
      .path = normalized.path,
    });
  }

  std::ranges::sort(files, [](const auto& left, const auto& right) {
    const auto left_path = lower_copy(left.path);
    const auto right_path = lower_copy(right.path);

    return left_path == right_path ? left.path < right.path : left_path < right_path;
  });

  return files;
}

std::optional<PackageAsset> read_optional_asset_file(
  const std::filesystem::path& file_path,
  const std::string& asset_path,
  const std::string& kind,
  const std::string& route
) {
  const auto absolute_path = std::filesystem::absolute(file_path).lexically_normal();

  if (!path_exists(absolute_path)) {
    return std::nullopt;
  }

  const auto normalized = normalize_asset_path(asset_path);

  if (!normalized.ok) {
    throw std::runtime_error{normalized.message};
  }

  return PackageAsset{
    .content = read_file(absolute_path),
    .content_type = asset_content_type(normalized.path),
    .kind = kind,
    .path = normalized.path,
    .route = route,
  };
}

PublishPackage collect_publish_package(const DocsCommandOptions& options, const std::string& source_id) {
  PublishPackage package;
  const auto docs_root = effective_docs_root(options);

  if (options.include_docs) {
    const auto absolute_docs_root = std::filesystem::absolute(docs_root).lexically_normal();

    if (!path_exists(absolute_docs_root)) {
      throw std::runtime_error{
        effective_docs_root_explicit(options)
          ? "Docs root does not exist: " + docs_root.string()
          : "Docs root does not exist: ./docs. Pass --docs <path> or --no-docs."
      };
    }

    package.files = walk_docs_files(docs_root);
  }

  std::vector<PackageAsset> skill_assets;

  if (options.include_skills) {
    const auto absolute_skills_root = std::filesystem::absolute(options.skills_root).lexically_normal();

    if (!path_exists(absolute_skills_root)) {
      if (options.skills_root_explicit) {
        throw std::runtime_error{"Skills root does not exist: " + options.skills_root.string()};
      }
    } else {
      skill_assets = walk_skill_files(options.skills_root, source_id);
    }
  }

  const auto llms_asset =
    options.include_llms && (path_exists(std::filesystem::absolute(options.llms_path).lexically_normal()) || options.llms_path_explicit)
      ? read_optional_asset_file(options.llms_path, "llms.txt", "llms", "/llms.txt")
      : std::optional<PackageAsset>{};

  if (options.include_llms && options.llms_path_explicit && !llms_asset) {
    throw std::runtime_error{"llms.txt file does not exist: " + options.llms_path.string()};
  }

  const auto llms_full_asset =
    options.include_llms_full && (path_exists(std::filesystem::absolute(options.llms_full_path).lexically_normal()) || options.llms_full_path_explicit)
      ? read_optional_asset_file(options.llms_full_path, "llms-full.txt", "llms-full", "/llms-full.txt")
      : std::optional<PackageAsset>{};

  if (options.include_llms_full && options.llms_full_path_explicit && !llms_full_asset) {
    throw std::runtime_error{"llms-full.txt file does not exist: " + options.llms_full_path.string()};
  }

  if (llms_asset) {
    package.assets.push_back(*llms_asset);
  }

  if (llms_full_asset) {
    package.assets.push_back(*llms_full_asset);
  }

  package.assets.insert(package.assets.end(), skill_assets.begin(), skill_assets.end());

  if (package.files.empty() && package.assets.empty()) {
    throw std::runtime_error{"Publish package is empty. Enable at least one of docs, skills, llms.txt, or llms-full.txt."};
  }

  package.summary = {
    .assets = package.assets.size(),
    .docs = package.files.size(),
    .llms = llms_asset ? "present" : "missing",
    .llms_full = llms_full_asset ? "present" : "missing",
    .skills = skill_assets.size(),
  };

  return package;
}

json package_summary_to_json(const PublishPackageSummary& summary) {
  return {
    {"assets", summary.assets},
    {"docs", summary.docs},
    {"llms", summary.llms},
    {"llmsFull", summary.llms_full},
    {"skills", summary.skills},
  };
}

json source_to_json(const std::string& source_id, const DocsCommandOptions& options) {
  json source = json::object();
  source["id"] = source_id;

  if (options.branch) {
    source["branch"] = *options.branch;
  }
  if (options.commit) {
    source["commit"] = *options.commit;
  }
  if (options.repository) {
    source["repository"] = *options.repository;
  }

  return source;
}

json build_manifest(
  const PublishPackage& package,
  const std::string& source_id,
  const DocsCommandOptions& options,
  const std::optional<std::string>& delete_behavior = std::nullopt,
  const std::optional<std::string>& mode = std::nullopt,
  const std::optional<bool>& publish = std::nullopt
) {
  json manifest = json::object();
  manifest["version"] = 1;
  manifest["source"] = source_to_json(source_id, options);
  if (mode) {
    manifest["mode"] = *mode;
  }
  if (delete_behavior) {
    manifest["deleteBehavior"] = *delete_behavior;
  }
  if (publish) {
    manifest["publish"] = *publish;
  }
  manifest["assets"] = json::array();
  manifest["files"] = json::array();

  for (const auto& asset : package.assets) {
    json asset_json = {
      {"content", asset.content},
      {"contentType", asset.content_type},
      {"kind", asset.kind},
      {"path", asset.path},
      {"sha256", sha256_hex(asset.content)},
    };

    if (asset.route) {
      asset_json["route"] = *asset.route;
    }

    manifest["assets"].push_back(std::move(asset_json));
  }

  for (const auto& file : package.files) {
    manifest["files"].push_back({
      {"path", file.path},
      {"content", file.content},
      {"sha256", sha256_hex(file.content)},
    });
  }

  return manifest;
}

bool is_valid_delete_behavior(const std::string& value) {
  return value == "archive" || value == "delete" || value == "draft" || value == "ignore";
}

ValidationResult validate_manifest(const json& manifest, const DocsCommandOptions& options, const std::string& route_base) {
  ValidationResult result;
  const auto max_file_bytes = options.max_file_bytes.value_or(kDefaultMaxFileBytes);
  const auto max_assets = options.max_files.value_or(kDefaultMaxFiles);
  const auto max_files = options.max_files.value_or(kDefaultMaxFiles);
  const auto max_total_bytes = options.max_total_bytes.value_or(kDefaultMaxTotalBytes);

  if (!manifest.is_object()) {
    result.issues.push_back(issue("invalid_manifest", "Manifest must be an object."));
    return result;
  }

  if (!manifest.contains("version") || !manifest["version"].is_number_integer() || manifest["version"].get<int>() != 1) {
    result.issues.push_back(issue("invalid_version", "Manifest version must be 1."));
  }

  if (!manifest.contains("source") || !manifest["source"].is_object() || !manifest["source"].contains("id") || !manifest["source"]["id"].is_string() || trim(manifest["source"]["id"].get<std::string>()).empty()) {
    result.issues.push_back(issue("invalid_source", "Manifest source.id is required."));
  } else {
    result.source_id = manifest["source"]["id"].get<std::string>();
    if (manifest["source"].contains("branch") && manifest["source"]["branch"].is_string()) {
      result.source_branch = manifest["source"]["branch"].get<std::string>();
    }
    if (manifest["source"].contains("commit") && manifest["source"]["commit"].is_string()) {
      result.source_commit = manifest["source"]["commit"].get<std::string>();
    }
    if (manifest["source"].contains("repository") && manifest["source"]["repository"].is_string()) {
      result.source_repository = manifest["source"]["repository"].get<std::string>();
    }
  }

  if (manifest.contains("mode")) {
    if (!manifest["mode"].is_string() || (manifest["mode"] != "dry-run" && manifest["mode"] != "sync")) {
      result.issues.push_back(issue("invalid_mode", "Manifest mode must be \"dry-run\" or \"sync\"."));
    } else {
      result.mode_dry_run = manifest["mode"] == "dry-run";
    }
  }

  if (manifest.contains("deleteBehavior")) {
    if (!manifest["deleteBehavior"].is_string() || !is_valid_delete_behavior(manifest["deleteBehavior"].get<std::string>())) {
      result.issues.push_back(issue("invalid_delete_behavior", "Manifest deleteBehavior must be archive, delete, draft, or ignore."));
    } else {
      result.delete_behavior = manifest["deleteBehavior"].get<std::string>();
    }
  }

  if (manifest.contains("publish")) {
    if (!manifest["publish"].is_boolean()) {
      result.issues.push_back(issue("invalid_manifest", "Manifest publish must be a boolean."));
    } else {
      result.publish = manifest["publish"].get<bool>();
    }
  }

  const auto has_files_array = manifest.contains("files") && manifest["files"].is_array();
  const auto has_assets_array = !manifest.contains("assets") || manifest["assets"].is_array();
  const auto file_count = has_files_array ? manifest["files"].size() : 0;
  const auto asset_count = has_assets_array && manifest.contains("assets") ? manifest["assets"].size() : 0;

  if (!has_files_array) {
    result.issues.push_back(issue("invalid_manifest", "Manifest files must be an array."));
  }

  if (!has_assets_array) {
    result.issues.push_back(issue("invalid_manifest", "Manifest assets must be an array when provided."));
  }

  if (file_count == 0 && asset_count == 0) {
    result.issues.push_back(issue("empty_manifest", "Manifest must include at least one docs file or asset."));
  }

  if (has_files_array && manifest["files"].size() > max_files) {
    result.issues.push_back(issue("too_many_files", "Manifest exceeds maximum file count of " + std::to_string(max_files) + "."));
  }

  if (has_assets_array && manifest.contains("assets") && manifest["assets"].size() > max_assets) {
    result.issues.push_back(issue("too_many_assets", "Manifest exceeds maximum asset count of " + std::to_string(max_assets) + "."));
  }

  std::set<std::string> normalized_paths;
  std::set<std::string> normalized_asset_paths;
  std::size_t total_bytes = 0;

  if (manifest.contains("files") && manifest["files"].is_array()) {
    for (const auto& file : manifest["files"]) {
      if (!file.is_object() || !file.contains("path") || !file["path"].is_string() || !file.contains("content") || !file["content"].is_string()) {
        std::optional<std::string> bad_path;
        if (file.is_object() && file.contains("path") && file["path"].is_string()) {
          bad_path = file["path"].get<std::string>();
        }
        result.issues.push_back(issue("invalid_manifest", "Manifest file entries require string path and content.", bad_path));
        continue;
      }

      const auto path = file["path"].get<std::string>();
      const auto content = file["content"].get<std::string>();
      const auto normalized = normalize_docs_path(path);

      if (!normalized.ok) {
        result.issues.push_back(issue(normalized.code, normalized.message, path));
        continue;
      }

      total_bytes += content.size();

      if (content.size() > max_file_bytes) {
        result.issues.push_back(issue("file_too_large", "File exceeds maximum size of " + std::to_string(max_file_bytes) + " bytes.", normalized.path));
      }

      const auto computed_hash = sha256_hex(content);

      if (file.contains("sha256")) {
        const auto valid_hash = file["sha256"].is_string() && file["sha256"].get<std::string>().size() == 64;
        auto hash_value = valid_hash ? file["sha256"].get<std::string>() : std::string{};
        std::ranges::transform(hash_value, hash_value.begin(), [](const auto ch) {
          return static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
        });

        if (!valid_hash || !std::ranges::all_of(hash_value, [](const auto ch) {
          return std::isxdigit(static_cast<unsigned char>(ch));
        }) || hash_value != computed_hash) {
          result.issues.push_back(issue("invalid_hash", "Manifest file sha256 does not match content.", normalized.path));
        }
      }

      const auto parsed = parse_frontmatter(content, normalized.path);
      result.issues.insert(result.issues.end(), parsed.issues.begin(), parsed.issues.end());
      result.warnings.insert(result.warnings.end(), parsed.warnings.begin(), parsed.warnings.end());

      if (normalized_paths.contains(normalized.path)) {
        result.issues.push_back(issue("duplicate_path", "Manifest contains duplicate normalized paths.", normalized.path));
      }
      normalized_paths.insert(normalized.path);

      result.files.push_back({
        .content = parsed.content,
        .frontmatter = parsed.frontmatter,
        .path = normalized.path,
        .route = derive_route_from_source_path(normalized.path, route_base, parsed.frontmatter.slug),
        .sha256 = computed_hash,
        .title = resolve_title(parsed, normalized.path),
      });
    }
  }

  if (manifest.contains("assets") && manifest["assets"].is_array()) {
    static const std::set<std::string> asset_kinds = {"llms", "llms-full", "skill", "static"};

    for (const auto& asset : manifest["assets"]) {
      if (
        !asset.is_object() ||
        !asset.contains("path") || !asset["path"].is_string() ||
        !asset.contains("content") || !asset["content"].is_string() ||
        !asset.contains("contentType") || !asset["contentType"].is_string() || trim(asset["contentType"].get<std::string>()).empty() ||
        !asset.contains("kind") || !asset["kind"].is_string()
      ) {
        std::optional<std::string> bad_path;
        if (asset.is_object() && asset.contains("path") && asset["path"].is_string()) {
          bad_path = asset["path"].get<std::string>();
        }
        result.issues.push_back(issue("invalid_asset", "Manifest asset entries require string path, content, contentType, and kind.", bad_path));
        continue;
      }

      const auto path = asset["path"].get<std::string>();
      const auto content = asset["content"].get<std::string>();
      const auto content_type = trim(asset["contentType"].get<std::string>());
      const auto kind = asset["kind"].get<std::string>();
      const auto route = asset.contains("route") && asset["route"].is_string() && !trim(asset["route"].get<std::string>()).empty()
        ? std::optional<std::string>{asset["route"].get<std::string>()}
        : std::optional<std::string>{};

      if (!asset_kinds.contains(kind)) {
        result.issues.push_back(issue("invalid_asset", "Manifest asset kind must be llms, llms-full, skill, or static.", path));
        continue;
      }

      const auto normalized = normalize_asset_path(path);

      if (!normalized.ok) {
        result.issues.push_back(issue(normalized.code, normalized.message, path));
        continue;
      }

      total_bytes += content.size();

      if (content.size() > max_file_bytes) {
        result.issues.push_back(issue("asset_too_large", "Asset exceeds maximum size of " + std::to_string(max_file_bytes) + " bytes.", normalized.path));
      }

      const auto computed_hash = sha256_hex(content);

      if (asset.contains("sha256")) {
        const auto valid_hash = asset["sha256"].is_string() && asset["sha256"].get<std::string>().size() == 64;
        auto hash_value = valid_hash ? asset["sha256"].get<std::string>() : std::string{};
        std::ranges::transform(hash_value, hash_value.begin(), [](const auto ch) {
          return static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
        });

        if (!valid_hash || !std::ranges::all_of(hash_value, [](const auto ch) {
          return std::isxdigit(static_cast<unsigned char>(ch));
        }) || hash_value != computed_hash) {
          result.issues.push_back(issue("invalid_hash", "Manifest asset sha256 does not match content.", normalized.path));
        }
      }

      if (normalized_asset_paths.contains(normalized.path)) {
        result.issues.push_back(issue("duplicate_asset_path", "Manifest contains duplicate normalized asset paths.", normalized.path));
      }
      normalized_asset_paths.insert(normalized.path);

      result.assets.push_back({
        .content = content,
        .content_type = content_type,
        .kind = kind,
        .path = normalized.path,
        .route = derive_asset_route_from_source_path(kind, route, route_base, result.source_id, normalized.path),
        .sha256 = computed_hash,
      });
    }
  }

  if (total_bytes > max_total_bytes) {
    result.issues.push_back(issue("manifest_too_large", "Manifest content exceeds maximum total size of " + std::to_string(max_total_bytes) + " bytes."));
  }

  result.ok = result.issues.empty() && !result.source_id.empty();
  return result;
}

json validated_file_to_json(const ValidatedFile& file) {
  return {
    {"content", file.content},
    {"frontmatter", frontmatter_to_json(file.frontmatter)},
    {"path", file.path},
    {"route", file.route},
    {"sha256", file.sha256},
    {"title", file.title},
  };
}

json validated_asset_to_json(const ValidatedAsset& asset) {
  json output = {
    {"content", asset.content},
    {"contentType", asset.content_type},
    {"kind", asset.kind},
    {"path", asset.path},
    {"sha256", asset.sha256},
  };

  if (asset.route) {
    output["route"] = *asset.route;
  }

  return output;
}

json validation_to_json(const ValidationResult& validation) {
  json output = json::object();
  output["ok"] = validation.ok;

  if (validation.ok) {
    json data = json::object();
    data["assets"] = json::array();
    for (const auto& asset : validation.assets) {
      data["assets"].push_back(validated_asset_to_json(asset));
    }
    data["deleteBehavior"] = validation.delete_behavior;
    data["files"] = json::array();
    for (const auto& file : validation.files) {
      data["files"].push_back(validated_file_to_json(file));
    }
    data["mode"] = validation.mode_dry_run ? "dry-run" : "sync";
    data["publish"] = validation.publish;
    data["source"] = json::object({{"id", validation.source_id}});
    if (validation.source_branch) {
      data["source"]["branch"] = *validation.source_branch;
    }
    if (validation.source_commit) {
      data["source"]["commit"] = *validation.source_commit;
    }
    if (validation.source_repository) {
      data["source"]["repository"] = *validation.source_repository;
    }
    data["version"] = 1;
    output["data"] = data;
  }

  output["issues"] = issues_to_json(validation.issues);
  output["warnings"] = issues_to_json(validation.warnings);

  return output;
}

std::string format_validation_summary(const std::filesystem::path& root, const std::string& source_id, std::size_t file_count, const PublishPackageSummary& summary, const ValidationResult& validation) {
  std::ostringstream out;
  out << "pmdocs validate\n\n";
  out << "Source: " << source_id << "\n";
  out << "Root: " << root.string() << "\n";
  out << "Files: " << file_count << "\n";
  out << "Assets: " << summary.assets << "\n";
  out << "Skills: " << summary.skills << "\n";
  out << "llms.txt: " << summary.llms << "\n";
  out << "llms-full.txt: " << summary.llms_full << "\n";
  out << "Status: " << (validation.ok ? "valid" : "invalid") << "\n";

  if (!validation.warnings.empty()) {
    out << "\nWarnings:\n" << format_issues(validation.warnings) << "\n";
  }

  if (!validation.ok && !validation.issues.empty()) {
    out << "\nErrors:\n" << format_issues(validation.issues) << "\n";
  }

  return out.str();
}

std::vector<ExistingRecord> load_existing_records(const std::filesystem::path& path) {
  json parsed;
  try {
    parsed = json::parse(read_file(path));
  } catch (const std::exception& error) {
    throw std::runtime_error{"Could not read --existing file: " + std::string{error.what()}};
  }

  if (!parsed.is_array()) {
    throw std::runtime_error{"--existing must point to a JSON array of existing docs records."};
  }

  std::vector<ExistingRecord> records;

  for (const auto& item : parsed) {
    if (!item.is_object() || !item.contains("route") || !item["route"].is_string() || !item.contains("sourcePath") || !item["sourcePath"].is_string()) {
      throw std::runtime_error{"--existing must point to a JSON array of existing docs records."};
    }

    ExistingRecord record = {
      .route = item["route"].get<std::string>(),
      .source_path = item["sourcePath"].get<std::string>(),
    };

    if (item.contains("archived") && item["archived"].is_boolean()) {
      record.archived = item["archived"].get<bool>();
    }
    if (item.contains("sourceHash") && item["sourceHash"].is_string()) {
      record.source_hash = item["sourceHash"].get<std::string>();
    }
    if (item.contains("status") && item["status"].is_string()) {
      record.status = item["status"].get<std::string>();
    }
    if (item.contains("title") && item["title"].is_string()) {
      record.title = item["title"].get<std::string>();
    }

    records.push_back(record);
  }

  return records;
}

Plan plan_docs_sync(const ValidationResult& desired, const std::vector<ExistingRecord>& existing, const std::optional<std::string>& delete_behavior_override) {
  Plan plan;
  const auto effective_delete_behavior = delete_behavior_override.value_or(desired.delete_behavior);
  std::map<std::string, ExistingRecord> existing_by_source_path;
  std::vector<std::string> existing_source_path_order;

  for (const auto& record : existing) {
    if (existing_by_source_path.contains(record.source_path)) {
      plan.warnings.push_back(issue("duplicate_existing_path", "Existing docs contain duplicate sourcePath \"" + record.source_path + "\".", record.source_path));
      continue;
    }

    existing_by_source_path[record.source_path] = record;
    existing_source_path_order.push_back(record.source_path);
  }

  std::set<std::string> desired_paths;

  for (const auto& desired_file : desired.files) {
    desired_paths.insert(desired_file.path);
    const auto current = existing_by_source_path.find(desired_file.path);

    if (current == existing_by_source_path.end()) {
      plan.create.push_back({
        .desired = desired_file,
        .reason = "No existing doc has this sourcePath.",
        .source_path = desired_file.path,
      });
      continue;
    }

    const auto desired_status = desired.publish ? "published" : "draft";
    const auto has_status_mismatch = current->second.status && *current->second.status != desired_status;

    const auto has_source_hash_mismatch = !current->second.source_hash || *current->second.source_hash != desired_file.sha256;
    const auto has_route_mismatch = current->second.route != desired_file.route;

    if (!has_source_hash_mismatch && !has_status_mismatch && !has_route_mismatch) {
      plan.unchanged.push_back({
        .current = current->second,
        .desired = desired_file,
        .reason = "Existing source hash matches desired source hash.",
        .source_path = desired_file.path,
      });
      continue;
    }

    plan.update.push_back({
      .current = current->second,
      .desired = desired_file,
      .reason = has_status_mismatch
        ? "Existing draft status differs from desired publish state."
        : has_source_hash_mismatch
          ? "Existing source hash differs from desired source hash."
          : "Existing route differs from desired route.",
      .source_path = desired_file.path,
    });
  }

  for (const auto& source_path : existing_source_path_order) {
    if (desired_paths.contains(source_path)) {
      continue;
    }

    const auto current = existing_by_source_path.at(source_path);
    PlannedChange change = {
      .current = current,
      .reason = "Existing doc is missing from desired manifest.",
      .source_path = source_path,
    };

    if (effective_delete_behavior == "archive") {
      plan.archive.push_back(change);
    } else if (effective_delete_behavior == "delete") {
      plan.delete_items.push_back(change);
    } else if (effective_delete_behavior == "draft") {
      plan.draft.push_back(change);
    }
  }

  return plan;
}

AssetPlan plan_docs_assets_sync(const ValidationResult& desired, const std::vector<ExistingAssetRecord>& existing, const std::optional<std::string>& delete_behavior_override) {
  AssetPlan plan;
  const auto effective_delete_behavior = delete_behavior_override.value_or(desired.delete_behavior);
  std::map<std::string, ExistingAssetRecord> existing_by_source_path;
  std::vector<std::string> existing_source_path_order;

  for (const auto& record : existing) {
    if (existing_by_source_path.contains(record.source_path)) {
      plan.warnings.push_back(issue("duplicate_existing_path", "Existing assets contain duplicate sourcePath \"" + record.source_path + "\".", record.source_path));
      continue;
    }

    existing_by_source_path[record.source_path] = record;
    existing_source_path_order.push_back(record.source_path);
  }

  std::set<std::string> desired_paths;

  for (const auto& desired_asset : desired.assets) {
    desired_paths.insert(desired_asset.path);
    const auto current = existing_by_source_path.find(desired_asset.path);

    if (current == existing_by_source_path.end()) {
      plan.create.push_back({
        .desired = desired_asset,
        .reason = "No existing asset has this sourcePath.",
        .source_path = desired_asset.path,
      });
      continue;
    }

    const auto has_source_hash_mismatch = !current->second.source_hash || *current->second.source_hash != desired_asset.sha256;
    const auto has_route_mismatch = current->second.route != desired_asset.route;
    const auto has_content_type_mismatch = current->second.content_type != desired_asset.content_type;
    const auto has_kind_mismatch = current->second.kind != desired_asset.kind;
    const auto is_archived = current->second.archived.value_or(false);

    if (!has_source_hash_mismatch && !has_route_mismatch && !has_content_type_mismatch && !has_kind_mismatch && !is_archived) {
      plan.unchanged.push_back({
        .current = current->second,
        .desired = desired_asset,
        .reason = "Existing source hash matches desired source hash.",
        .source_path = desired_asset.path,
      });
      continue;
    }

    plan.update.push_back({
      .current = current->second,
      .desired = desired_asset,
      .reason = is_archived
        ? "Existing asset is archived and should be reactivated."
        : has_source_hash_mismatch
          ? "Existing source hash differs from desired source hash."
          : has_route_mismatch
            ? "Existing route differs from desired route."
            : has_content_type_mismatch
              ? "Existing content type differs from desired content type."
              : "Existing asset kind differs from desired kind.",
      .source_path = desired_asset.path,
    });
  }

  for (const auto& source_path : existing_source_path_order) {
    if (desired_paths.contains(source_path)) {
      continue;
    }

    const auto current = existing_by_source_path.at(source_path);
    PlannedAssetChange change = {
      .current = current,
      .reason = "Existing asset is missing from desired manifest.",
      .source_path = source_path,
    };

    if (effective_delete_behavior == "archive" || effective_delete_behavior == "draft") {
      plan.archive.push_back(change);
    } else if (effective_delete_behavior == "delete") {
      plan.delete_items.push_back(change);
    }
  }

  return plan;
}

json existing_record_to_json(const ExistingRecord& record) {
  json output = {
    {"route", record.route},
    {"sourcePath", record.source_path},
  };

  if (record.archived) {
    output["archived"] = *record.archived;
  }
  if (record.source_hash) {
    output["sourceHash"] = *record.source_hash;
  }
  if (record.status) {
    output["status"] = *record.status;
  }
  if (record.title) {
    output["title"] = *record.title;
  }

  return output;
}

json existing_asset_record_to_json(const ExistingAssetRecord& record) {
  json output = {
    {"contentType", record.content_type},
    {"kind", record.kind},
    {"sourcePath", record.source_path},
  };

  if (record.archived) {
    output["archived"] = *record.archived;
  }
  if (record.route) {
    output["route"] = *record.route;
  }
  if (record.source_hash) {
    output["sourceHash"] = *record.source_hash;
  }

  return output;
}

json planned_change_to_json(const PlannedChange& change) {
  json output = {
    {"reason", change.reason},
    {"sourcePath", change.source_path},
  };

  if (change.current) {
    output["current"] = existing_record_to_json(*change.current);
  }
  if (change.desired) {
    output["desired"] = validated_file_to_json(*change.desired);
  }

  return output;
}

json planned_asset_change_to_json(const PlannedAssetChange& change) {
  json output = {
    {"reason", change.reason},
    {"sourcePath", change.source_path},
  };

  if (change.current) {
    output["current"] = existing_asset_record_to_json(*change.current);
  }
  if (change.desired) {
    output["desired"] = validated_asset_to_json(*change.desired);
  }

  return output;
}

json changes_to_json(const std::vector<PlannedChange>& changes) {
  json output = json::array();

  for (const auto& change : changes) {
    output.push_back(planned_change_to_json(change));
  }

  return output;
}

json asset_changes_to_json(const std::vector<PlannedAssetChange>& changes) {
  json output = json::array();

  for (const auto& change : changes) {
    output.push_back(planned_asset_change_to_json(change));
  }

  return output;
}

json plan_to_json(const Plan& plan) {
  return {
    {"archive", changes_to_json(plan.archive)},
    {"create", changes_to_json(plan.create)},
    {"delete", changes_to_json(plan.delete_items)},
    {"draft", changes_to_json(plan.draft)},
    {"unchanged", changes_to_json(plan.unchanged)},
    {"update", changes_to_json(plan.update)},
    {"warnings", issues_to_json(plan.warnings)},
  };
}

json asset_plan_to_json(const AssetPlan& plan) {
  return {
    {"archive", asset_changes_to_json(plan.archive)},
    {"create", asset_changes_to_json(plan.create)},
    {"delete", asset_changes_to_json(plan.delete_items)},
    {"unchanged", asset_changes_to_json(plan.unchanged)},
    {"update", asset_changes_to_json(plan.update)},
    {"warnings", issues_to_json(plan.warnings)},
  };
}

std::string format_plan_summary(const Plan& plan, const AssetPlan& asset_plan, const PublishPackageSummary& summary) {
  std::ostringstream out;
  out << "pmdocs plan\n\n";
  out << "Docs: " << summary.docs << "\n";
  out << "Assets: " << summary.assets << "\n";
  out << "Skills: " << summary.skills << "\n";
  out << "llms.txt: " << summary.llms << "\n";
  out << "llms-full.txt: " << summary.llms_full << "\n\n";
  out << "Create: " << plan.create.size() << "\n";
  out << "Update: " << plan.update.size() << "\n";
  out << "Unchanged: " << plan.unchanged.size() << "\n";
  out << "Archive: " << plan.archive.size() << "\n";
  out << "Delete: " << plan.delete_items.size() << "\n";
  out << "Draft: " << plan.draft.size() << "\n";
  out << "Warnings: " << plan.warnings.size() << "\n";
  out << "\n";
  out << "Asset create: " << asset_plan.create.size() << "\n";
  out << "Asset update: " << asset_plan.update.size() << "\n";
  out << "Asset unchanged: " << asset_plan.unchanged.size() << "\n";
  out << "Asset archive: " << asset_plan.archive.size() << "\n";
  out << "Asset delete: " << asset_plan.delete_items.size() << "\n";
  out << "Asset warnings: " << asset_plan.warnings.size() << "\n";

  auto warnings = plan.warnings;
  warnings.insert(warnings.end(), asset_plan.warnings.begin(), asset_plan.warnings.end());

  if (!warnings.empty()) {
    out << "\nWarnings:\n" << format_issues(warnings) << "\n";
  }

  return out.str();
}

CommandResult validate_or_manifest(const DocsCommandOptions& options, bool print_manifest) {
  try {
    const auto source_id = source_id_for(options);
    const auto package = collect_publish_package(options, source_id);
    const auto manifest = build_manifest(package, source_id, options);
    auto validation = validate_manifest(manifest, options, "/" + source_id);

    if (print_manifest) {
      if (!validation.ok) {
        return {
          .exit_code = 1,
          .stderr_text = "Manifest is invalid.\n\nErrors:\n" + format_issues(validation.issues) + "\n",
        };
      }

      return {
        .exit_code = 0,
        .stdout_text = json_string(manifest, options.pretty),
      };
    }

    if (options.print_json) {
      json output = {
        {"fileCount", package.files.size()},
        {"package", package_summary_to_json(package.summary)},
        {"root", effective_docs_root(options).string()},
        {"sourceId", source_id},
        {"validation", validation_to_json(validation)},
      };

      return {
        .exit_code = validation.ok ? 0 : 1,
        .stdout_text = json_string(output, options.pretty),
      };
    }

    return {
      .exit_code = validation.ok ? 0 : 1,
      .stdout_text = format_validation_summary(effective_docs_root(options), source_id, package.files.size(), package.summary, validation),
    };
  } catch (const std::exception& error) {
    return {
      .exit_code = 1,
      .stderr_text = std::string{error.what()} + "\n",
    };
  }
}

} // namespace

std::string sha256_hex(std::string_view input) {
  static constexpr std::array<std::uint32_t, 64> k = {
    0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U, 0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
    0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U, 0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
    0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU, 0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
    0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U, 0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
    0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U, 0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
    0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U, 0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
    0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U, 0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
    0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U, 0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U,
  };
  std::array<std::uint32_t, 8> hash = {
    0x6a09e667U,
    0xbb67ae85U,
    0x3c6ef372U,
    0xa54ff53aU,
    0x510e527fU,
    0x9b05688cU,
    0x1f83d9abU,
    0x5be0cd19U,
  };
  std::vector<std::uint8_t> bytes(input.begin(), input.end());
  const auto bit_length = static_cast<std::uint64_t>(bytes.size()) * 8U;
  bytes.push_back(0x80U);

  while ((bytes.size() % 64U) != 56U) {
    bytes.push_back(0U);
  }

  for (int shift = 56; shift >= 0; shift -= 8) {
    bytes.push_back(static_cast<std::uint8_t>((bit_length >> shift) & 0xffU));
  }

  for (std::size_t chunk = 0; chunk < bytes.size(); chunk += 64) {
    std::array<std::uint32_t, 64> w = {};

    for (std::size_t index = 0; index < 16; ++index) {
      const auto offset = chunk + index * 4;
      w[index] =
        (static_cast<std::uint32_t>(bytes[offset]) << 24U) |
        (static_cast<std::uint32_t>(bytes[offset + 1]) << 16U) |
        (static_cast<std::uint32_t>(bytes[offset + 2]) << 8U) |
        static_cast<std::uint32_t>(bytes[offset + 3]);
    }

    for (std::size_t index = 16; index < 64; ++index) {
      const auto s0 = std::rotr(w[index - 15], 7) ^ std::rotr(w[index - 15], 18) ^ (w[index - 15] >> 3U);
      const auto s1 = std::rotr(w[index - 2], 17) ^ std::rotr(w[index - 2], 19) ^ (w[index - 2] >> 10U);
      w[index] = w[index - 16] + s0 + w[index - 7] + s1;
    }

    auto a = hash[0];
    auto b = hash[1];
    auto c = hash[2];
    auto d = hash[3];
    auto e = hash[4];
    auto f = hash[5];
    auto g = hash[6];
    auto h = hash[7];

    for (std::size_t index = 0; index < 64; ++index) {
      const auto s1 = std::rotr(e, 6) ^ std::rotr(e, 11) ^ std::rotr(e, 25);
      const auto choice = (e & f) ^ ((~e) & g);
      const auto temp1 = h + s1 + choice + k[index] + w[index];
      const auto s0 = std::rotr(a, 2) ^ std::rotr(a, 13) ^ std::rotr(a, 22);
      const auto majority = (a & b) ^ (a & c) ^ (b & c);
      const auto temp2 = s0 + majority;

      h = g;
      g = f;
      f = e;
      e = d + temp1;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2;
    }

    hash[0] += a;
    hash[1] += b;
    hash[2] += c;
    hash[3] += d;
    hash[4] += e;
    hash[5] += f;
    hash[6] += g;
    hash[7] += h;
  }

  std::ostringstream out;
  out << std::hex << std::setfill('0');

  for (const auto word : hash) {
    out << std::setw(8) << word;
  }

  return out.str();
}

std::string build_canonical_signing_string(
  const std::string& body_sha256,
  const std::string& method,
  const std::string& path,
  const std::string& timestamp,
  const std::string& nonce
) {
  std::string normalized_method = method;
  std::ranges::transform(normalized_method, normalized_method.begin(), [](const unsigned char ch) {
    return static_cast<char>(std::toupper(ch));
  });

  std::string normalized_hash = body_sha256;
  std::ranges::transform(normalized_hash, normalized_hash.begin(), [](const unsigned char ch) {
    return static_cast<char>(std::tolower(ch));
  });

  return "v1\n"
    + normalized_method
    + "\n"
    + normalize_canonical_path(path)
    + "\n"
    + timestamp
    + "\n"
    + nonce
    + "\n"
    + normalized_hash;
}

GeneratedKeyPair generate_ed25519_key_pair(const std::string& format) {
  const auto key = generate_ed25519_evp_key();

  if (format == "pem") {
    return {
      .private_key = private_key_to_pem(key.get()),
      .public_key = public_key_to_pem(key.get()),
    };
  }

  if (format == "base64") {
    const auto private_der = private_key_to_pkcs8_der(key.get());
    const auto public_der = public_key_to_spki_der(key.get());
    return {
      .private_key = base64_encode(private_der.data(), private_der.size()),
      .public_key = base64_encode(public_der.data(), public_der.size()),
    };
  }

  throw std::runtime_error{"--format must be pem or base64."};
}

SignedDocsRequest sign_docs_sync_request(
  const std::string& body,
  const std::string& endpoint,
  const std::string& key_id,
  const std::string& private_key,
  const std::string& nonce,
  const std::string& timestamp
) {
  const auto body_sha256 = sha256_hex(body);
  const auto canonical = build_canonical_signing_string(
    body_sha256,
    "POST",
    get_endpoint_path(endpoint),
    timestamp,
    nonce
  );
  const auto key = read_ed25519_private_key(private_key);
  const auto signature = sign_ed25519_base64(key.get(), canonical);

  return {
    .body = body,
    .headers = {
      {"Content-Type", "application/json"},
      {"X-VL-MD-DOCS-Body-SHA256", body_sha256},
      {"X-VL-MD-DOCS-Key-Id", key_id},
      {"X-VL-MD-DOCS-Nonce", nonce},
      {"X-VL-MD-DOCS-Signature", signature},
      {"X-VL-MD-DOCS-Timestamp", timestamp},
    },
  };
}

CommandResult run_keygen_command(const KeygenOptions& options) {
  try {
    const auto keys = generate_ed25519_key_pair(options.format);

    if (!options.out_dir) {
      return {
        .exit_code = 0,
        .stdout_text = "Public key:\n\n" + trim(keys.public_key) + "\n\nPrivate key:\n\n" + trim(keys.private_key) + "\n",
      };
    }

    const auto out_dir = std::filesystem::absolute(*options.out_dir).lexically_normal();
    const auto public_key_path = out_dir / "docs-sync-public.pem";
    const auto private_key_path = out_dir / "docs-sync-private.pem";
    std::error_code error;
    const auto public_exists = std::filesystem::exists(public_key_path, error);
    error.clear();
    const auto private_exists = std::filesystem::exists(private_key_path, error);

    if (!options.force && (public_exists || private_exists)) {
      return {
        .exit_code = 1,
        .stderr_text = "Key files already exist. Use --force to overwrite docs-sync-public.pem and docs-sync-private.pem.\n",
      };
    }

    std::filesystem::create_directories(out_dir, error);
    if (error) {
      return {
        .exit_code = 1,
        .stderr_text = "Could not create output directory: " + error.message() + "\n",
      };
    }

    write_file(public_key_path, trim(keys.public_key) + "\n");
    write_file(private_key_path, trim(keys.private_key) + "\n");

    return {
      .exit_code = 0,
      .stdout_text = "Wrote public key: " + public_key_path.string() + "\nWrote private key: " + private_key_path.string() + "\n",
    };
  } catch (const std::exception& error) {
    return {
      .exit_code = 1,
      .stderr_text = std::string{error.what()} + "\n",
    };
  }
}

CommandResult run_validate_command(const DocsCommandOptions& options) {
  return validate_or_manifest(options, false);
}

CommandResult run_manifest_command(const DocsCommandOptions& options) {
  return validate_or_manifest(options, true);
}

CommandResult run_plan_command(const PlanCommandOptions& options) {
  try {
    if (options.delete_behavior && !is_valid_delete_behavior(*options.delete_behavior)) {
      return {
        .exit_code = 1,
        .stderr_text = "--delete-behavior must be archive, delete, draft, or ignore.\n",
      };
    }

    const auto source_id = source_id_for(options);
    const auto package = collect_publish_package(options, source_id);
    const auto manifest = build_manifest(package, source_id, options, options.delete_behavior);
    auto validation = validate_manifest(manifest, options, "/" + source_id);

    if (!validation.ok) {
      return {
        .exit_code = 1,
        .stderr_text = "Manifest is invalid.\n\nErrors:\n" + format_issues(validation.issues) + "\n",
      };
    }

    std::vector<ExistingRecord> existing;
    if (options.existing_path) {
      existing = load_existing_records(*options.existing_path);
    }

    auto plan = plan_docs_sync(validation, existing, options.delete_behavior);
    auto asset_plan = plan_docs_assets_sync(validation, {}, options.delete_behavior);

    if (options.print_json) {
      return {
        .exit_code = 0,
        .stdout_text = json_string({
          {"assets", asset_plan_to_json(asset_plan)},
          {"docs", plan_to_json(plan)},
          {"package", package_summary_to_json(package.summary)},
        }, options.pretty),
      };
    }

    return {
      .exit_code = 0,
      .stdout_text = format_plan_summary(plan, asset_plan, package.summary),
    };
  } catch (const std::exception& error) {
    return {
      .exit_code = 1,
      .stderr_text = std::string{error.what()} + "\n",
    };
  }
}

CommandResult run_push_command(const PushCommandOptions& options) {
  try {
    if (options.endpoint.empty()) {
      return {
        .exit_code = 1,
        .stderr_text = "Push requires --endpoint <url>.\n",
      };
    }

    const auto endpoint = validate_endpoint_url(options.endpoint);

    if (options.delete_behavior && !is_valid_delete_behavior(*options.delete_behavior)) {
      return {
        .exit_code = 1,
        .stderr_text = "--delete-behavior for push must be archive, delete, draft, or ignore.\n",
      };
    }

    if (options.github_oidc) {
      if (options.key_id) {
        return {
          .exit_code = 1,
          .stderr_text = "Do not use --key-id with --github-oidc.\n",
        };
      }

      if (options.private_key_file || options.private_key_env) {
        return {
          .exit_code = 1,
          .stderr_text = "Do not use Ed25519 private key flags with --github-oidc.\n",
        };
      }
    } else {
      if (!options.key_id) {
        return {
          .exit_code = 1,
          .stderr_text = "Push requires --key-id <id>.\n",
        };
      }

      if (options.private_key_file && options.private_key_env) {
        return {
          .exit_code = 1,
          .stderr_text = "Use either --private-key-file or --private-key-env, not both.\n",
        };
      }

      if (!options.private_key_file && !options.private_key_env) {
        return {
          .exit_code = 1,
          .stderr_text = "Push requires --private-key-file or --private-key-env.\n",
        };
      }
    }

    const auto source_id = source_id_for(options);
    const auto package = collect_publish_package(options, source_id);
    const auto mode = options.dry_run ? std::string{"dry-run"} : std::string{"sync"};
    const auto delete_behavior = options.delete_behavior.value_or("archive");
    const auto manifest = build_manifest(
      package,
      source_id,
      options,
      delete_behavior,
      mode,
      options.publish
    );
    auto validation = validate_manifest(manifest, options, "/" + source_id);

    if (!validation.ok) {
      return {
        .exit_code = 1,
        .stderr_text = "Manifest is invalid.\n\nErrors:\n" + format_issues(validation.issues) + "\n",
      };
    }

    std::string route_warning;
    if (!package.assets.empty() && !has_public_asset_routes()) {
      if (options.strict_routes) {
        return {
          .exit_code = 1,
          .stderr_text = std::string{kMissingAssetRoutesWarning},
        };
      }

      route_warning = kMissingAssetRoutesWarning;
    }

    const auto body = manifest.dump();
    SignedDocsRequest request;

    if (options.github_oidc) {
      const auto token = read_github_oidc_token(options, source_id);
      request = {
        .body = body,
        .headers = {
          {"Authorization", "Bearer " + token},
          {"Content-Type", "application/json"},
          {"X-VL-MD-DOCS-Body-SHA256", sha256_hex(body)},
        },
      };
    } else {
      std::string private_key;
      if (options.private_key_env) {
        const auto* value = std::getenv(options.private_key_env->c_str());
        if (value == nullptr || *value == '\0') {
          return {
            .exit_code = 1,
            .stderr_text = "Environment variable \"" + *options.private_key_env + "\" is not set.\n",
          };
        }
        private_key = value;
      } else {
        try {
          private_key = read_file(*options.private_key_file);
        } catch (const std::exception& error) {
          return {
            .exit_code = 1,
            .stderr_text = std::string{"Could not read private key file: "} + error.what() + "\n",
          };
        }
      }

      request = sign_docs_sync_request(
        body,
        endpoint,
        *options.key_id,
        private_key,
        random_uuid_v4(),
        current_iso_timestamp()
      );
    }

    const auto response = curl_json_request("POST", endpoint, request.headers, request.body);
    const auto response_ok = response.ok && response.has_json && response.body.is_object()
      && response.body.contains("ok") && response.body["ok"].is_boolean() && response.body["ok"].get<bool>();

    if (options.print_json) {
      const json output = {
        {"endpoint", endpoint},
        {"mode", mode},
        {"package", package_summary_to_json(package.summary)},
        {"response", response.has_json ? response.body : json(nullptr)},
        {"sourceId", source_id},
        {"status", response.status},
      };

      return {
        .exit_code = response_ok ? 0 : 1,
        .stdout_text = json_string(output, options.pretty),
        .stderr_text = route_warning,
      };
    }

    if (!response_ok) {
      return {
        .exit_code = 1,
        .stderr_text = route_warning + format_server_failure(response),
      };
    }

    const auto summary = response.body.contains("summary") && response.body["summary"].is_object()
      ? response.body["summary"]
      : json::object();
    const auto response_delete_behavior = response.body.contains("deleteBehavior") && response.body["deleteBehavior"].is_string()
      ? response.body["deleteBehavior"].get<std::string>()
      : delete_behavior;
    const auto response_publish_requested = response.body.contains("publishRequested") && response.body["publishRequested"].is_boolean()
      ? response.body["publishRequested"].get<bool>()
      : options.publish;

    const auto summary_count = [&summary](std::string_view key) -> int {
      const auto key_string = std::string{key};
      return summary.contains(key_string) && summary[key_string].is_number_integer()
        ? summary[key_string].get<int>()
        : 0;
    };

    std::ostringstream out;
    out << "pmdocs push\n\n";
    out << "Endpoint: " << endpoint << "\n";
    out << "Mode: " << mode << "\n";
    out << "Source: " << source_id << "\n";
    out << "Publish requested: " << (response_publish_requested ? "yes" : "no") << "\n";
    out << "Delete behavior: " << response_delete_behavior << "\n\n";
    out << "Create: " << summary_count("create") << "\n";
    out << "Update: " << summary_count("update") << "\n";
    out << "Unchanged: " << summary_count("unchanged") << "\n";
    out << "Archive: " << summary_count("archive") << "\n";
    out << "Delete: " << summary_count("delete") << "\n";
    out << "Draft: " << summary_count("draft") << "\n";
    out << "Asset create: " << summary_count("assetCreate") << "\n";
    out << "Asset update: " << summary_count("assetUpdate") << "\n";
    out << "Asset unchanged: " << summary_count("assetUnchanged") << "\n";
    out << "Asset archive: " << summary_count("assetArchive") << "\n";
    out << "Asset delete: " << summary_count("assetDelete") << "\n";
    out << "Warnings: " << summary_count("warnings") << "\n\n";
    out << "Status: " << (mode == "sync" ? "applied" : "accepted") << "\n";

    if (response.body.contains("syncRunId") && response.body["syncRunId"].is_string()) {
      out << "Sync run: " << response.body["syncRunId"].get<std::string>() << "\n";
    }

    return {
      .exit_code = 0,
      .stdout_text = out.str(),
      .stderr_text = route_warning,
    };
  } catch (const std::exception& error) {
    return {
      .exit_code = 1,
      .stderr_text = std::string{error.what()} + "\n",
    };
  }
}

} // namespace pmdocs
