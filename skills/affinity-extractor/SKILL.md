---
name: affinity-extractor
description: Extract design assets from Affinity Designer files (.af, .afdesign). Use when users need to analyze Affinity files, extract layer names, text content, fonts, element sizes, or embedded images without opening Affinity Designer. Triggers on requests involving Affinity Designer file analysis, design asset extraction, or reverse-engineering Affinity file structure.
license: MIT
---

# Affinity Extractor

Extract layer names, text content, fonts, and element bounding boxes from Affinity Designer v2/v3 files.

## Quick Start

Run the extraction script:

`python scripts/extract_affinity.py document.af output.json`

For pre-extracted ZSTD data:

`python scripts/extract_affinity.py --from-bin extracted.bin output.json`

## Output Format

The script outputs JSON with these fields:

```json
{
  "source": "document.af",
  "metadata": {"document": {...}},
  "layers": ["Layer 1", "Button", "Slider"],
  "text_content": ["Label", "Value"],
  "fonts": ["Roboto-Regular", "ArialMT"],
  "element_sizes": [{"width": 1920, "height": 1080, "x": 0, "y": 0}]
}
```

## Workflow

1. **Run extraction script** on the .af file to get structured JSON
2. **Analyze output** for layer hierarchy, text labels, fonts used
3. **Use element_sizes** to understand layout dimensions (sorted by area, largest first)

Extracted assets can be placed in `tmp/` in current workspace for easy access (should be gitignore'd).

## Requirements

- Python 3.10+
- binwalk (via system install or `nix-shell -p binwalk`)

The script auto-detects binwalk and falls back to nix-shell if unavailable.

## Limitations

- Cannot extract vector paths or effects
- Cannot render artboards (they exist only as vector data)
- Bounding boxes are approximate
- Some localization strings are filtered out

## File Format Details

For manual extraction or debugging, see [references/file-format.md](references/file-format.md).

## Resources

### scripts/
- `extract_affinity.py` - Main extraction script; run directly on .af files

### references/
- `file-format.md` - Binary format documentation with tag reference table
