import React from 'react';
import { createRoot } from 'react-dom/client';
import { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';

import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

/**
 * Uploads a pasted/dropped file to the assessment content image endpoint.
 * BlockNote's uploadFile just needs the callback to resolve to a URL string.
 */
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch('/teacher/assessments/upload-image', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();

  if (!data.success) {
    throw new Error('Image upload failed.');
  }
  return data.file.url;
}

/**
 * Global mount API called from a small inline script in the assessment
 * create/duplicate view. Returns a synchronous handle — BlockNote's
 * `editor.document` is always up to date, no async save() call required.
 */
window.AssessmentEditorApp = {
  mount(elementId, initialContent) {
    const container = document.getElementById(elementId);
    if (!container) {
      throw new Error('Editor container not found: ' + elementId);
    }

    const editor = BlockNoteEditor.create({
      initialContent: initialContent && initialContent.length ? initialContent : undefined,
      uploadFile,
    });

    const root = createRoot(container);
    root.render(React.createElement(BlockNoteView, { editor, theme: 'light' }));

    return {
      getContent: () => editor.document,
    };
  },
};
