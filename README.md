# Vendor-Management
Vendor and project management system for ICON (to learn SDD)

## Backups

The application does not back itself up. Whoever runs production must set up backups outside the application.

A production backup must include both of these:

- **The PostgreSQL database** named by `DATABASE_URL`. It holds every record, including client advances, reversals, import history, and change history.
- **The `FILE_STORAGE_DIR` folder.** It holds the bytes of every uploaded document and costing sheet. The database stores only each file's name and storage key, so a document can be recovered only if its file is in this folder.

The two must form a matching pair. Back up the database first and the folder second. The application writes each uploaded file before it saves the file's database row, and it never deletes a stored file, so a folder copied after the database contains every file the database copy refers to. The folder may also hold a few extra files from uploads made in between; these are harmless.

Restore the database and the folder together, from the same pair. Restoring only one of them is not a recovery: a database without its folder lists documents that cannot be downloaded, and a folder without its database has no titles, owners, or links for its files.

The application has no way to delete a document. Archiving only hides a document from the default list, and its file stays in `FILE_STORAGE_DIR`. Keep backups so that every document stays recoverable for at least seven years from upload. This period is the project's requirement (FR-016 and the constitution's Product Boundaries), not a reviewed legal requirement; applicable law or firm policy may require longer.

The uploaded import file itself is never stored. While a preview is open, its cell values are held in the database. They are cleared when the preview is confirmed or cancelled, or after it expires (on the next view, confirmation, cancellation, or upload), so a backup taken meanwhile can contain them. After confirmation, only the import results are kept.

The `docker-compose.yml` database is for local development. It is not a backup.
