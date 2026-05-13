pmdocs_config = configuration_data()
pmdocs_config.set_quoted('PMDOCS_VERSION', meson.project_version())
pmdocs_config.set_quoted('PMDOCS_DATA_DIR', pmdocs_data_dir_full)

pmdocs_config_h = configure_file(
  input: 'config.hpp.in',
  output: 'pmdocs_config.hpp',
  configuration: pmdocs_config,
)

cli11_dep = dependency('CLI11', required: false)
if not cli11_dep.found()
  cli11_dep = dependency('cli11', required: false)
endif
if not cli11_dep.found()
  cli11_dep = dependency('CLI11', method: 'cmake', required: false)
endif
if not cli11_dep.found()
  error('CLI11 dependency not found. Install cli11 and ensure pkgconf/pkg-config or CMake can discover it.')
endif

nlohmann_json_dep = dependency('nlohmann_json', required: false)
if not nlohmann_json_dep.found()
  nlohmann_json_dep = dependency('nlohmann_json', method: 'cmake', required: false)
endif
if not nlohmann_json_dep.found()
  nlohmann_json_dep = dependency('nlohmann-json', required: false)
endif
if not nlohmann_json_dep.found()
  error('nlohmann-json dependency not found. Install nlohmann-json/nlohmann-json3-dev.')
endif

doctest_dep = dependency('doctest', required: false)
if not doctest_dep.found()
  doctest_dep = dependency('doctest', method: 'cmake', required: false)
endif
if not doctest_dep.found()
  error('doctest dependency not found. Install doctest/doctest-dev.')
endif

pmdocs_include_dirs = include_directories('include')
pmdocs_deps = [
  cli11_dep,
  nlohmann_json_dep,
]

pmdocs_sources = files(
  'src/cli.cpp',
)

pmdocs_lib = static_library(
  'pmdocs_core',
  pmdocs_sources,
  pmdocs_config_h,
  dependencies: pmdocs_deps,
  include_directories: pmdocs_include_dirs,
)

pmdocs_exe = executable(
  'pmdocs',
  files('src/main.cpp'),
  dependencies: pmdocs_deps,
  include_directories: pmdocs_include_dirs,
  link_with: pmdocs_lib,
  install: true,
)

pmdocs_test_exe = executable(
  'pmdocs_tests',
  files('tests/cli_tests.cpp'),
  dependencies: pmdocs_deps + [doctest_dep],
  include_directories: pmdocs_include_dirs,
  link_with: pmdocs_lib,
)

pmdocs_test_env = environment()
pmdocs_test_env.set('PMDOCS_DATA_DIR', meson.project_source_root())

test('pmdocs help', pmdocs_exe, args: ['--help'])
test('pmdocs version', pmdocs_exe, args: ['--version'])
test('pmdocs doctor', pmdocs_exe, args: ['doctor'], env: pmdocs_test_env)
test('pmdocs skill install help', pmdocs_exe, args: ['skill', 'install', '--help'], env: pmdocs_test_env)
test('pmdocs skill install dry-run', pmdocs_exe, args: ['skill', 'install', '--dry-run'], env: pmdocs_test_env)
test('pmdocs unit tests', pmdocs_test_exe)

summary(
  {
    'CLI11': cli11_dep.found(),
    'nlohmann_json': nlohmann_json_dep.found(),
    'doctest': doctest_dep.found(),
  },
  section: 'Native CLI dependencies',
)
