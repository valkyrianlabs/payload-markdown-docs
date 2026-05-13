pmdocs_config = configuration_data()
pmdocs_config.set_quoted('PMDOCS_VERSION', meson.project_version())
pmdocs_config.set_quoted('PMDOCS_DATA_DIR', pmdocs_data_dir_full)

pmdocs_config_h = configure_file(
  input: 'pmdocs/config.hpp.in',
  output: 'pmdocs_config.hpp',
  configuration: pmdocs_config,
)

pmdocs_sources = files(
  'pmdocs/cli.cpp',
  'pmdocs/main.cpp',
)

pmdocs_exe = executable(
  'pmdocs',
  pmdocs_sources,
  pmdocs_config_h,
  include_directories: include_directories('.'),
  install: true,
)

test('pmdocs help', pmdocs_exe, args: ['--help'])
test('pmdocs version', pmdocs_exe, args: ['--version'])
test('pmdocs doctor', pmdocs_exe, args: ['doctor'])
test('pmdocs skill install help', pmdocs_exe, args: ['skill', 'install', '--help'])
