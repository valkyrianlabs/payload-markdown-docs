project(
  'payload-markdown-docs',
  'cpp',
  version: '0.8.1',
  license: 'MIT',
  meson_version: '>=1.2.0',
  default_options: [
    'buildtype=debugoptimized',
    'cpp_std=c++23,c++20',
    'warning_level=2',
    'werror=false',
  ],
)

pmdocs_data_dir = get_option('datadir') / 'pmdocs'

if get_option('datadir').startswith('/')
  pmdocs_data_dir_full = pmdocs_data_dir
else
  pmdocs_data_dir_full = get_option('prefix') / pmdocs_data_dir
endif

subdir('cli')

if get_option('install_skill_data')
  install_subdir(
    'skills/payload-markdown-docs',
    install_dir: pmdocs_data_dir / 'skills',
  )
endif
