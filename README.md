# Butcher Specials Hub

A starter local database for weekly specials across:

- Kingaroy Meats
- Calliope Meats
- Tannum Meats

Open `index.html` in a browser to use it, or run the local preview server:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1 4173
```

Then open `http://localhost:4173/`.

The app stores data in the browser's local storage and can export:

- JSON backups for restoring the whole database
- CSV files for spreadsheet use
- printable weekly store sheets

For remote iPhone use and shared cloud data, follow [cloud-setup.md](cloud-setup.md).

For GitHub Pages hosting, follow [github-setup.md](github-setup.md).

## What it tracks

- Week starting date
- Product and cut notes
- Supplier
- Purchase price
- Sell price
- Unit
- GP margin
- Which stores are running the special
- Store-level sales results
- Supplier contact notes
- Invoice notes and source file names

## Working safely

Use **Backup JSON** regularly, especially before clearing browser data or moving computers. To share between computers, save the JSON backup into OneDrive, Google Drive, Dropbox, or a shared folder, then use **Restore** on another machine.

## Future upgrades

Good next steps would be:

- Move storage from browser local storage to a real shared database.
- Add invoice OCR for photos and PDFs.
- Add weekly order quantities by store.
- Add dashboards for best/worst specials by store, supplier, and GP dollars.
