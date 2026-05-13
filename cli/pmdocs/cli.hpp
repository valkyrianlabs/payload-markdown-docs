#pragma once

#include <string>
#include <string_view>
#include <vector>

namespace pmdocs {

struct CommandResult {
  int exit_code = 0;
  std::string stdout_text;
  std::string stderr_text;
};

CommandResult run(std::vector<std::string_view> args);

} // namespace pmdocs
