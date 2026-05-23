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

curl_dep = dependency('libcurl', required: false)
if not curl_dep.found()
  curl_dep = dependency('CURL', method: 'cmake', required: false)
endif
if not curl_dep.found()
  error('libcurl dependency not found. Install libcurl4-openssl-dev on Debian/Ubuntu or curl on Homebrew.')
endif

openssl_dep = dependency('openssl', version: '>=3.0', required: false)
if not openssl_dep.found()
  openssl_dep = dependency('OpenSSL', version: '>=3.0', method: 'cmake', required: false)
endif
if not openssl_dep.found()
  error('OpenSSL 3 dependency not found. Install libssl-dev on Debian/Ubuntu or openssl@3 on Homebrew.')
endif

pmdocs_include_dirs = include_directories('include')
pmdocs_deps = [
  cli11_dep,
  curl_dep,
  nlohmann_json_dep,
  openssl_dep,
]

pmdocs_sources = files(
  'src/cli.cpp',
  'src/docs.cpp',
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
  include_directories: pmdocs_include_dirs,
  link_with: pmdocs_lib,
  install: true,
)

pmdocs_test_exe = executable(
  'pmdocs_tests',
  files('tests/cli_tests.cpp'),
  dependencies: [
    doctest_dep,
    nlohmann_json_dep,
  ],
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
test('pmdocs validate fixture', pmdocs_exe, args: ['validate', '../dev/docs-fixtures/basic', '--source', 'payload-markdown-docs'])
test('pmdocs manifest fixture', pmdocs_exe, args: ['manifest', '../dev/docs-fixtures/basic', '--source', 'payload-markdown-docs'])
test('pmdocs plan fixture', pmdocs_exe, args: ['plan', '../dev/docs-fixtures/basic', '--source', 'payload-markdown-docs'])
test('pmdocs unit tests', pmdocs_test_exe)

if get_option('native_cli_parity_tests')
  node_program = find_program('node', required: true)
  find_program('pnpm', required: true)

  test(
    'pmdocs phase2 npm parity',
    node_program,
    args: [
      files('tests/parity/phase2_parity.mjs'),
      pmdocs_exe.full_path(),
    ],
    depends: pmdocs_exe,
    timeout: 120,
  )
endif

summary(
  {
    'CLI11': cli11_dep.found(),
    'libcurl': curl_dep.version(),
    'nlohmann_json': nlohmann_json_dep.found(),
    'OpenSSL': openssl_dep.version(),
    'doctest': doctest_dep.found(),
    'native_cli_parity_tests': get_option('native_cli_parity_tests'),
  },
  section: 'Native CLI dependencies',
)
