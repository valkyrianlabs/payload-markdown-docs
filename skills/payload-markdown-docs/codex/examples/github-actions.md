# GitHub Actions Example

```yaml
name: Publish docs

on:
  pull_request:
    paths:
      - 'docs/**'
      - 'skills/**'
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'skills/**'

permissions:
  id-token: write
  contents: read

jobs:
  docs:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Install pmdocs
        run: |
          sudo install -d -m 0755 /etc/apt/keyrings
          curl -fsSL https://apt.valkyrianlabs.com/pubkey.asc \
            | gpg --dearmor \
            | sudo tee /etc/apt/keyrings/valkyrianlabs.gpg > /dev/null
          sudo chmod 0644 /etc/apt/keyrings/valkyrianlabs.gpg
          echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/valkyrianlabs.gpg] https://apt.valkyrianlabs.com stable main" \
            | sudo tee /etc/apt/sources.list.d/valkyrianlabs.list > /dev/null
          sudo apt-get update
          sudo apt-get install -y pmdocs

      - name: Check pmdocs
        run: |
          pmdocs --version
          pmdocs --help

      - name: Validate docs package
        run: pmdocs validate --source main-docs

      - name: Dry-run docs package sync
        if: github.event_name == 'pull_request'
        run: |
          pmdocs push \
            --endpoint "$DOCS_SYNC_ENDPOINT" \
            --source main-docs \
            --github-oidc \
            --dry-run
        env:
          DOCS_SYNC_ENDPOINT: ${{ secrets.DOCS_SYNC_ENDPOINT }}

      - name: Publish docs package
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: |
          pmdocs push \
            --endpoint "$DOCS_SYNC_ENDPOINT" \
            --source main-docs \
            --github-oidc \
            --publish
        env:
          DOCS_SYNC_ENDPOINT: ${{ secrets.DOCS_SYNC_ENDPOINT }}
```
