#include "cli.hpp"

#include <cstddef>
#include <iostream>
#include <string_view>
#include <vector>

int main(int argc, char* argv[]) {
  std::vector<std::string_view> args;
  args.reserve(static_cast<std::size_t>(argc > 0 ? argc - 1 : 0));

  for (int index = 1; index < argc; ++index) {
    args.emplace_back(argv[index]);
  }

  const auto result = pmdocs::run(args);

  if (!result.stdout_text.empty()) {
    std::cout << result.stdout_text;
  }

  if (!result.stderr_text.empty()) {
    std::cerr << result.stderr_text;
  }

  return result.exit_code;
}
