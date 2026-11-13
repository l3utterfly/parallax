# Parallax

A 2.5D photo viewer in Vite, React, TypeScript and Three.js, in the style of iOS Spatial Scenes. It uses two layers with depth, plus a clock between them.

```bash
npm install
npm run dev
```

## Inputs

1. **Background**: the scene with the character removed and the hole filled in.
2. **Character**: a PNG cut-out with alpha, the same size as the background (for example, from `scripts/withoutBG`).
3. **Depth map**: depth of the original photo from `scripts/Depth-Anything-V2/depth_test.py`. Use `<name>_<encoder>_16bit.png`, which is 16-bit grayscale inverse depth with white = near. The PNG is decoded in JS (`fast-png`) so it keeps full 16-bit precision. 8-bit grayscale also works.

`public/samples/anime/` holds a demo set made from the public-domain test image in `scripts/withoutBG/test_images`. Its background is a quick OpenCV inpaint, so expect smudges where the character used to be.

## How it works

- `src/parallax/prepare.ts` derives a depth map for each layer from the single depth map, at a working size of up to 512 px:
  - **Background depth**: the character region (dilated) is removed and filled from the surrounding depth using push-pull, so the inpainted background doesn't bulge forward where the character used to be.
  - **Character depth**: the eroded interior is extended outward past the silhouette, so the edges move as one piece instead of smearing toward the background.
- `src/parallax/ParallaxViewer.ts` turns each layer into a dense grid mesh. Each vertex is placed along the ray from the centered camera through its pixel, so the view at rest matches the source image exactly. The mouse moves the camera, which looks at the focus depth.
- The layers are drawn in order (background, clock, character) with a depth clear between them, so the clock is always sandwiched between the two layers.
