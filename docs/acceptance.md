# Manual acceptance checklist

Use disposable Drive Markdown files and a temporary browser profile.

- [ ] Start with empty configuration. Create, edit, import and download an English/Myanmar file. Confirm UTF-8 bytes and existing line endings.
- [ ] Refresh after **Saved locally** and recover both active and inactive drafts. Use a second tab and confirm only the first tab persists its workspace.
- [ ] Compose Myanmar text using the actual OS IME, including stacked characters and combining marks. Select and replace a full composition, then use undo/redo. Compare a downloaded file with the original code points.
- [ ] Configure a real OAuth Web application. Cancel consent, retry, connect and verify the Drive scope shown by Google. Try a blocked popup. Confirm local editing works during popup, API, or network failures.
- [ ] Open a chosen Markdown file through the real Picker, then save and verify its Drive file ID and contents. Open a read-only file, then test a deleted or unshared file. Confirm source remains available.
- [ ] Create a file and copy it. Confirm distinct IDs. Rename an editable file and check the same ID. Simulate a lost create response, refresh and retry with the original account. Confirm only one file was created.
- [ ] Enable autosave. Check saving, saved, offline, and failed status. Edit during a delayed save and switch to another file. Verify the first file's newer edit remains pending.
- [ ] Let the token expire or invalidate its authority. Confirm recovery data survives a reconnect. Switch Google accounts and verify the existing destination is blocked. Explicitly reconnect the original account and save.
- [ ] Open the same Drive file on another device or in another client. Save an external change, then attempt a save from Markdown Desk. Compare versions, download or copy the local text, and reload the remote text. Verify both versions are recoverable.
- [ ] Verify no remote image request happens by default, even from inline HTML. Opt in to an HTTPS image and confirm it loads. Check both themes, keyboard navigation, view modes, and tablet sizing.
- [ ] Visit the deployed HTTPS custom-domain and/or repository-subpath URL. Check DNS ownership, CNAME and enforced HTTPS. Confirm assets load on a hard refresh and open real Google consent and Picker from the deployed origin.
