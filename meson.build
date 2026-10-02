project(
  'payload-markdown-docs',
  'cpp',
  version: '1.1.0',
  license: 'MIT',
  meson_version: '>=1.3.0',
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
  companion_skill_option = get_option('companion_skill_data')
  companion_skill_found = fs.exists(payload_markdown_skill_dir / 'codex' / 'SKILL.md')

  if companion_skill_option.enabled() and not companion_skill_found
    error(
      'payload-markdown companion skill data was not found at '
      + payload_markdown_skill_dir
      + '. Run pnpm install before building the native pmdocs package, or pass -Dcompanion_skill_data=auto.'
    )
  endif

  install_subdir(
    'skills/payload-markdown-docs',
    install_dir: pmdocs_data_dir / 'skills',
  )

  if companion_skill_found and not companion_skill_option.disabled()
    install_subdir(
      payload_markdown_skill_dir,
      install_dir: pmdocs_data_dir / 'skills',
    )
  elif not companion_skill_option.disabled()
    warning('payload-markdown companion skill data not found; installing payload-markdown-docs skill data only.')
  endif
endif
