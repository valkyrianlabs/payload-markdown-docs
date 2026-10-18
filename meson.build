project(
  'payload-markdown-docs',
  'cpp',
  version: '1.3.0',
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
  install_subdir(
    'skills/payload-markdown-docs',
    install_dir: pmdocs_data_dir / 'skills',
  )

  # payload-markdown's own skill, vendored from the payload-markdown npm package by
  # scripts/sync-payload-markdown-skill.mjs (checked against node_modules in CI), so every
  # build, including Homebrew's from the source archive, bundles it.
  if not get_option('companion_skill_data').disabled()
    if not fs.exists('skills' / 'payload-markdown' / 'codex' / 'SKILL.md')
      error('skills/payload-markdown is missing. Run pnpm sync:pm-skill, or pass -Dcompanion_skill_data=disabled.')
    endif

    install_subdir(
      'skills/payload-markdown',
      install_dir: pmdocs_data_dir / 'skills',
    )
  endif
endif
