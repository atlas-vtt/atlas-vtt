# Hiding Obsidian tabs for the note preview

To hide tabs while maintaining full editing functionality in the note preview window:

1. **CSS Approach**: Add styles to hide tab headers with a specific data attribute:
   ```css
   .workspace-tab-header[data-atlas-preview="true"] {
     display: none !important;
   }
   .workspace-tab-container:has(.workspace-tab-header[data-atlas-preview="true"]):not(:has(.workspace-tab-header:not([data-atlas-preview="true"]))) {
     display: none !important;
   }
   ```

2. **Leaf Management**: 
   - Create a new leaf with `this.app.workspace.getLeaf(true)`
   - Mark the leaf and its tab header with `data-atlas-preview="true"` attribute
   - **Critical**: Call `leaf.detach()` to remove the leaf from the main workspace split
   - This prevents the leaf from affecting the active view while keeping it functional

3. **View Preservation**:
   - Store the original active leaf before creating the preview leaf
   - After opening the file in the preview leaf, restore the original active leaf
   - Use `this.app.workspace.setActiveLeaf(originalActiveLeaf, { focus: false })`

4. **Content Rendering**:
   - After detaching, manually append the leaf's view container to the preview window
   - This maintains full editing capabilities while preventing workspace navigation

This approach ensures the user stays on the map canvas while previewing notes with full editing support.
