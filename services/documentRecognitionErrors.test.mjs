import test from 'node:test';
import assert from 'node:assert/strict';
import {
  documentRecognitionError,
  documentRecognitionNetworkError,
} from './documentRecognitionErrors.mjs';

test('describes common authentication and deployment failures', () => {
  assert.match(documentRecognitionError(401), /sign-in session/i);
  assert.match(documentRecognitionError(403), /permission/i);
  assert.match(documentRecognitionError(404), /not deployed/i);
});

test('describes upload and AI provider failures', () => {
  assert.match(documentRecognitionError(413), /10 MB/i);
  assert.match(documentRecognitionError(415), /Unsupported document/i);
  assert.match(documentRecognitionError(502), /AI provider/i);
  assert.match(documentRecognitionError(503, { error: 'AI API key is missing.' }), /API key is missing/i);
  assert.match(documentRecognitionError(504), /timed out/i);
  assert.match(documentRecognitionError(500, null), /could not be processed/i);
});

test('explains that a fetch failure can be deployment, CORS, or network related', () => {
  const error = documentRecognitionNetworkError();
  assert.match(error, /not be deployed/i);
  assert.match(error, /CORS, network/i);
});
