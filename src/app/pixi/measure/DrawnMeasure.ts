import { Container } from 'pixi.js';
import type { GridGeometry } from '../../grid/gridDistance';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { Measurement } from '../../measure/measureTypes';
import type { MeasureParts } from '../measurePartsVisibility';
import { destroyTree } from '../utils/destroyTree';
import { drawMeasurement, measureLabelTarget } from '../utils/measureDrawing';
import { MeasureInk, type MeasureInkLayer } from '../utils/measureInk';
import { MeasureLabel } from '../utils/measureLabel';
import { legDistances, pathDistance } from './measureDistances';

/** A leg's label beside the distance's: the same pill, smaller. */
const LEG_LABEL_SIZE = 0.8;

/** What every measurement is drawn by: the zoom it shows at, the map's grid and rules, and the theme's accent. */
export interface MeasureLook {
  readonly zoom: number;
  readonly grid: GridGeometry;
  readonly settings: MeasurementSettings;
  /** The colour of a measurement that names none. */
  readonly accent: number;
}

/**
 * One measurement on the map: its shape in ink, and its labels (the distance; for a ruler with
 * corners also each leg's length, small, at the leg's middle). The labels are one part, shown and
 * hidden together.
 */
export class DrawnMeasure {
  readonly distance = new MeasureLabel();
  /** What shows or hides the measurement: its shape, and its labels as one. The same object for its life. */
  readonly parts: MeasureParts;
  private readonly ink: MeasureInk;
  private readonly labels = new Container({ label: 'measure-labels-of-one', eventMode: 'none', interactiveChildren: false });
  private readonly legs: MeasureLabel[] = [];
  private drawn: { readonly measurement: Measurement; readonly color: number | null } | null = null;

  /** Its shape goes onto `shapes`, its labels into `labels`. */
  constructor(shapes: MeasureInkLayer, labels: Container) {
    this.ink = new MeasureInk(shapes);
    this.labels.addChild(this.distance.view);
    labels.addChild(this.labels);
    this.parts = { shape: this.ink.shape, label: this.labels };
  }

  /** The container of its labels, for what stands with them (the pin). */
  get labelLayer(): Container {
    return this.labels;
  }

  /** Draws `measurement` in `color` (null: the accent). */
  draw(measurement: Measurement, color: number | null, look: MeasureLook): void {
    this.drawn = { measurement, color };
    this.redraw(look);
  }

  /** Draws it again as it is: the zoom, the theme, the grid or the rules changed. */
  redraw(look: MeasureLook): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const { measurement, color } = drawn;
    const { zoom, grid, settings } = look;
    this.ink.begin(zoom);
    drawMeasurement(this.ink, color ?? look.accent, measurement, settings.coneAngle);
    this.distance.show(pathDistance(grid, measurement.points, settings), measureLabelTarget(measurement), zoom, grid.size);
    const legs = measurement.shape === 'ruler' ? legDistances(grid, measurement.points, settings) : [];
    this.fitLegs(legs.length);
    legs.forEach(({ from, to, distance }, index) => this.legs[index]!.show(distance, { beside: [from, to] }, zoom, grid.size));
  }

  /** Takes the drawing away; the labels are hidden by whoever shows and hides the parts. */
  clear(): void {
    this.drawn = null;
    this.ink.clear();
    this.fitLegs(0);
  }

  destroy(): void {
    this.ink.destroy();
    destroyTree(this.labels);
  }

  /** As many leg labels as legs to name. */
  private fitLegs(count: number): void {
    while (this.legs.length > count) this.legs.pop()?.destroy();
    while (this.legs.length < count) {
      const label = new MeasureLabel(LEG_LABEL_SIZE);
      this.labels.addChild(label.view);
      this.legs.push(label);
    }
  }
}
