project(
  'payload-markdown-docs',
  'cpp',
  version: '1.0.5',
  license: 'MIT',
  meson_version: '>=1.2.0',
  default_options: [
    'buildtype=debugoptimized',
    'cpp_std=c++23,c++20',
    'warning_level=2',
    'werror=false',
  ],
)

fs = import('fs')
cpp = meson.get_compiler('cpp')
add_project_arguments(
  cpp.get_supported_arguments(['-Wno-missing-field-initializers']),
  language: 'cpp',
)

pmdocs_data_dir = get_option('datadir') / 'pmdocs'

if get_option('datadir').startswith('/')
  pmdocs_data_dir_full = pmdocs_data_dir
else
  pmdocs_data_dir_full = get_option('prefix') / pmdocs_data_dir
endif

subdir('cli')

if get_option('install_skill_data')
  payload_markdown_skill_dir = 'node_modules' / '@valkyrianlabs' / 'payload-markdown' / 'skills' / 'payload-markdown'

  if not fs.exists(payload_markdown_skill_dir / 'codex' / 'SKILL.md')
    error(
      'payload-markdown companion skill data was not found at '
      + payload_markdown_skill_dir
      + '. Run pnpm install before building the native pmdocs package.'
    )
  endif

  install_subdir(
    'skills/payload-markdown-docs',
    install_dir: pmdocs_data_dir / 'skills',
  )

  install_subdir(
    payload_markdown_skill_dir,
    install_dir: pmdocs_data_dir / 'skills',
  )
endif
