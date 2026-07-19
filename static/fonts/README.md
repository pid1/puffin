# Fonts

## DejaVu Sans (`DejaVuSans.ttf`, `DejaVuSans-Bold.ttf`)

Used by the PDF export ([`src/puffin/routers/dashboard.py`](../../src/puffin/routers/dashboard.py))
so that notes and medication names containing emoji, curly quotes, em dashes,
and accented characters render correctly. FPDF's built-in core fonts are
Latin-1 only and raise on anything outside that range — a note typed on a phone
(which auto-substitutes curly quotes) would otherwise crash the whole export.

DejaVu Sans is a freely redistributable font derived from Bitstream Vera, under
the permissive **DejaVu Fonts License** (a Bitstream Vera / free license that
allows bundling and redistribution). Upstream: https://dejavu-fonts.github.io/

If these files are ever missing, the PDF export falls back to the core
Helvetica font and transliterates non-Latin-1 characters (curly quotes → ASCII,
emoji → `?`) rather than crashing — so the export always succeeds, just with
reduced fidelity until the fonts are restored.
