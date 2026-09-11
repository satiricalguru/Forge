/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const path = require('path');
const { Readable } = require('stream');
const tar = require('tar-stream');
const through = require('through2');

/**
 * Small Vinyl transform for trusted build downloads. Only regular files are
 * emitted, and archive paths are validated before they become filesystem paths.
 */
module.exports = function untar() {
	return through.obj(function (file, _encoding, callback) {
		if (file.isNull()) {
			callback();
			return;
		}

		const output = this;
		const extract = tar.extract();
		let completed = false;
		const complete = error => {
			if (completed) return;
			completed = true;
			callback(error);
		};

		extract.on('entry', (header, stream, next) => {
			const archivePath = header.name;
			const normalized = path.posix.normalize(archivePath);
			if (!archivePath || archivePath.includes('\0') || archivePath.includes('\\') || archivePath.startsWith('/') || /^[A-Za-z]:/.test(archivePath)
				|| normalized === '..' || normalized.startsWith('../')) {
				stream.resume();
				extract.destroy(new Error(`Refusing unsafe archive path: ${archivePath}`));
				return;
			}

			if (header.type !== 'file') {
				stream.resume();
				stream.on('end', next);
				return;
			}

			const chunks = [];
			stream.on('data', chunk => chunks.push(chunk));
			stream.on('error', complete);
			stream.on('end', () => {
				const extracted = file.clone({ contents: false });
				extracted.path = path.join(path.dirname(file.path), ...normalized.split('/'));
				extracted.contents = Buffer.concat(chunks);
				output.push(extracted);
				next();
			});
		});
		extract.on('finish', () => complete());
		extract.on('error', complete);

		const contents = file.isBuffer() ? Readable.from(file.contents) : file.contents;
		contents.on('error', complete);
		contents.pipe(extract);
	});
};
