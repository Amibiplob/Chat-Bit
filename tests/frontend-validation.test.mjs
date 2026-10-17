import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formErrors, registrationFormSchema, registrationSchema, loginSchema, passwordSchema, profileSchema, searchSchema, PASSWORD_MIN, PASSWORD_MAX } from '../lib/form-validation.mjs';
import { registrationSchema as serverRegistration, loginSchema as serverLogin } from '../lib/server/auth-validation.mjs';
import { passwordSchema as serverPassword, profileSchema as serverProfile } from '../lib/server/settings-validation.mjs';
import { allowedAttachments, MAX_ATTACHMENT_BYTES, attachmentFileError, normalizedFileType } from '../lib/attachment-policy.mjs';
import { validateAttachmentMetadata } from '../lib/server/attachment-validation.mjs';

test('browser and server share authoritative schemas and eight-character new-password bounds', () => {
  assert.equal(serverRegistration, registrationSchema); assert.equal(serverLogin, loginSchema);
  assert.equal(serverPassword, passwordSchema); assert.equal(serverProfile, profileSchema);
  assert.equal(PASSWORD_MIN, 8); assert.equal(PASSWORD_MAX, 128);
  const base = { name: ' Person ', email: ' TEST@EXAMPLE.COM ', password: 'x'.repeat(PASSWORD_MIN) };
  assert.equal(registrationSchema.parse(base).email, 'test@example.com');
  for (const length of [8, 12, 128]) assert.equal(registrationSchema.safeParse({ ...base, password: 'x'.repeat(length) }).success, true);
  for (const length of [0, 7, 129]) assert.ok(formErrors(registrationSchema, { ...base, password: 'x'.repeat(length) }).password);
  assert.equal(loginSchema.safeParse({ email: base.email, password: 'x' }).success, true, 'Login must accept existing short passwords');
  assert.deepEqual(Object.keys(formErrors(loginSchema, { email: '', password: '' })), ['email', 'password']);
  for (const email of ['invalid', 'a@', 'a'.repeat(255)]) assert.ok(formErrors(loginSchema, { email, password: 'valid' }).email);
  for (const name of ['', '   ', 'x'.repeat(81)]) assert.ok(formErrors(registrationSchema, { ...base, name }).name);
  assert.equal(formErrors(registrationFormSchema, { ...base, confirmPassword: 'different' }).confirmPassword, 'Passwords do not match.');
  assert.deepEqual(formErrors(registrationFormSchema, { ...base, confirmPassword: base.password }), {});
});

test('password-change and profile validation explains field failures without changing policy', () => {
  const input = { currentPassword: 'old password', newPassword: 'new passphrase', confirmPassword: 'new passphrase' };
  assert.deepEqual(formErrors(passwordSchema, input), {});
  assert.ok(formErrors(passwordSchema, { ...input, currentPassword: '' }).currentPassword);
  assert.ok(formErrors(passwordSchema, { ...input, newPassword: 'short', confirmPassword: 'short' }).newPassword.includes('8'));
  assert.equal(formErrors(passwordSchema, { ...input, confirmPassword: 'different passphrase' }).confirmPassword, 'New passwords must match.');
  assert.equal(formErrors(passwordSchema, { ...input, newPassword: input.currentPassword, confirmPassword: input.currentPassword }).newPassword, 'Choose a different new password.');
  assert.ok(formErrors(profileSchema, { displayName: '   ', bio: '' }).displayName);
  assert.ok(formErrors(profileSchema, { displayName: 'Person', bio: 'x'.repeat(161) }).bio);
  assert.equal(searchSchema.safeParse('  ').success, false);
  assert.equal(searchSchema.safeParse(' x ').success, false);
});

test('file picker policy matches every server-supported format and enforces size/name bounds', () => {
  for (const [extension, mime] of allowedAttachments) {
    const file = { name: `example.${extension.toUpperCase()}`, type: '', size: MAX_ATTACHMENT_BYTES };
    assert.equal(attachmentFileError(file), '');
    assert.equal(normalizedFileType(file), mime);
    assert.equal(validateAttachmentMetadata({ filename: file.name, mimeType: normalizedFileType(file), byteSize: file.size }).extension, extension);
  }
  assert.match(attachmentFileError({ name: 'example.pdf', type: '', size: MAX_ATTACHMENT_BYTES + 1 }), /10 MB/);
  assert.match(attachmentFileError({ name: 'example.txt', type: '', size: 0 }), /nonempty/);
  assert.match(attachmentFileError({ name: 'executable.exe', type: 'image/png', size: 1 }), /Unsupported/);
  assert.match(attachmentFileError({ name: '../example.pdf', type: '', size: 1 }), /filename/);
});
