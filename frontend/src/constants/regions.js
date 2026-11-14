// Body-region geometry for the status overlay.
//
// Every number is a PERCENTAGE of the skeleton image (public/skeleton-light.png, 610 x 1280),
// so the overlay lines up at any rendered size. Tweak these to move rings and markers:
//   shapes[]   ellipses drawn as rings/glows and used as click areas
//     cx, cy   centre: % of image width, % of image height
//     rx       horizontal radius, % of image width
//     ry       vertical radius,   % of image height
//     rotate   optional, degrees clockwise around the centre
//   marker     the small dot the leader line starts from (x: % width, y: % height)
//   side       which side of the figure the callout label sits on
//   calloutY   vertical centre of the callout label, % of image height
export const IMAGE = { width: 610, height: 1280 };

// Desktop callout stage, in % of the stage width: the figure sits in the middle and the
// labels fill the columns either side. Label columns end 2% short of the figure.
export const STAGE = { figureLeft: 27, figureWidth: 46, labelWidth: 25 };

export const REGIONS = [
  {
    id: 'head',
    label: 'Head',
    title: 'Head and mind',
    side: 'left',
    calloutY: 7,
    marker: { x: 50, y: 4 },
    shapes: [{ cx: 50, cy: 6.7, rx: 12, ry: 7.6 }],
  },
  {
    id: 'chest',
    label: 'Chest',
    title: 'Heart and lungs',
    side: 'right',
    calloutY: 22,
    marker: { x: 50, y: 23 },
    shapes: [{ cx: 50, cy: 26.3, rx: 21, ry: 10.4 }],
  },
  {
    id: 'abdomen',
    label: 'Abdomen',
    title: 'Abdomen and kidneys',
    side: 'left',
    calloutY: 44,
    marker: { x: 50, y: 43 },
    shapes: [{ cx: 50, cy: 45, rx: 18.5, ry: 7.6 }],
  },
  {
    id: 'limbs',
    label: 'Bones and muscles',
    title: 'Bones and muscles',
    side: 'right',
    calloutY: 62,
    marker: { x: 62.5, y: 62 },
    shapes: [
      { cx: 16.4, cy: 38.3, rx: 8, ry: 21.5, rotate: 13.2 }, // left arm
      { cx: 83.6, cy: 38.3, rx: 8, ry: 21.5, rotate: -13.2 }, // right arm
      { cx: 39.3, cy: 76.2, rx: 8, ry: 23.4, rotate: -3.5 }, // left leg
      { cx: 60.7, cy: 76.2, rx: 8, ry: 23.4, rotate: 3.5 }, // right leg
    ],
  },
];

export const REGIONS_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
