import {copyFile, mkdir, constants} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import process from 'node:process';
import {parseArguments, validatePaths} from './inputs.mjs';

/** Prepare the reviewed fixed-paper animation without manufacturing scene images. */
export async function prepareAnimatedDemo(source, destination) {
  const {input, output, audioMode, storyboard, scene3Artwork} = await validatePaths(source, destination);
  if (storyboard || audioMode !== 'continuous') throw new Error('Animated demo requires original continuous narration inputs, not a storyboard preview');
  await mkdir(output); // Deliberately require a fresh directory, retaining prior evidence.
  for (const name of ['source-artwork.png','narration.wav','narration.json', ...(scene3Artwork ? ['scene3-artwork.png'] : [])]) {
    await copyFile(resolve(input,name),resolve(output,name),constants.COPYFILE_EXCL);
  }
  return {input:output, renderMode:'d2nn-scientific-animation'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = parseArguments(process.argv.slice(2));
  prepareAnimatedDemo(args.input,args.output).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    process.stderr.write(`Animation preparation failed: ${error.message}\n`); process.exitCode = 1;
  });
}
