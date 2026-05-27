# Architecture diagrams

Mermaid source files. Keep them as `.mmd` to:

- edit in plain text
- render offline (`mmdc -i architecture.mmd -o architecture.svg`)
- embed in markdown by copy-pasting into a ```mermaid block

## Files

| File | Content |
|------|---------|
| [architecture.mmd](architecture.mmd) | Overall architecture (components + data flow) |
| [sequence-recommend.mmd](sequence-recommend.mmd) | Full sequence of a recommend request |
| [sequence-ingest.mmd](sequence-ingest.mmd) | Full sequence of a GitHub ingest |

## Local rendering

```bash
npm install -g @mermaid-js/mermaid-cli
mmdc -i architecture.mmd -o architecture.svg
```
