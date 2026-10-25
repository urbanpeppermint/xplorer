/**
 * Illuminated primitives for the Rowenta helmet visor HUD.
 *
 * Every element is additive, depth-test-free geometry built with MeshBuilder and
 * owns a cloned Pass, so each readout's colour and intensity animate independently.
 * Geometry is authored in the XY plane (z = 0) and faces the camera, which looks
 * down local -Z; `twoSided` is on so winding never matters.
 */

export type Rgb = {r: number; g: number; b: number}

/** Rowenta app palette pushed into Iron-Man HUD emission range. */
export const HUD_CYAN: Rgb = {r: 0.0, g: 0.78, b: 0.9} // #00A5B5 core
export const HUD_ICE: Rgb = {r: 0.66, g: 0.97, b: 1.0} // highlight / primary type
export const HUD_AMBER: Rgb = {r: 1.0, g: 0.6, b: 0.14} // return vector
export const HUD_ALERT: Rgb = {r: 1.0, g: 0.22, b: 0.26} // error
export const HUD_RAIL: Rgb = {r: 0.1, g: 0.45, b: 0.62} // inert chrome / #002B45 lifted

const VERTEX_LAYOUT = [{name: "position", components: 3}]
const DEG = Math.PI / 180

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  }
}

/** Two triangles from four CCW corners in the XY plane. */
export function pushQuad(
  verts: number[],
  indices: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): void {
  const base = verts.length / 3
  verts.push(ax, ay, 0, bx, by, 0, cx, cy, 0, dx, dy, 0)
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

/** Axis-aligned rectangle centred on (cx, cy). */
export function pushRect(
  verts: number[],
  indices: number[],
  cx: number,
  cy: number,
  w: number,
  h: number
): void {
  const hw = w * 0.5
  const hh = h * 0.5
  pushQuad(verts, indices, cx - hw, cy - hh, cx + hw, cy - hh, cx + hw, cy + hh, cx - hw, cy + hh)
}

/** Rotated bar between two points — used for map paths and vectors. */
export function pushSegment(
  verts: number[],
  indices: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-5) {
    return
  }
  const nx = (-dy / len) * thickness * 0.5
  const ny = (dx / len) * thickness * 0.5
  pushQuad(verts, indices, x0 - nx, y0 - ny, x1 - nx, y1 - ny, x1 + nx, y1 + ny, x0 + nx, y0 + ny)
}

/** Annulus sector. `startDeg` 0 = +X, sweeping counter-clockwise. */
export function pushArc(
  verts: number[],
  indices: number[],
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  startDeg: number,
  sweepDeg: number,
  segments: number
): void {
  if (segments < 1 || Math.abs(sweepDeg) < 0.01) {
    return
  }
  const inner = radius - thickness * 0.5
  const outer = radius + thickness * 0.5
  const step = (sweepDeg / segments) * DEG
  const start = startDeg * DEG
  for (let i = 0; i < segments; i++) {
    const t0 = start + step * i
    const t1 = start + step * (i + 1)
    const c0 = Math.cos(t0)
    const s0 = Math.sin(t0)
    const c1 = Math.cos(t1)
    const s1 = Math.sin(t1)
    pushQuad(
      verts,
      indices,
      cx + c0 * inner,
      cy + s0 * inner,
      cx + c0 * outer,
      cy + s0 * outer,
      cx + c1 * outer,
      cy + s1 * outer,
      cx + c1 * inner,
      cy + s1 * inner
    )
  }
}

/** Radial tick marks around a circle — the reticle's bearing marks. */
export function pushRadialTicks(
  verts: number[],
  indices: number[],
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  thickness: number,
  count: number,
  offsetDeg: number
): void {
  for (let i = 0; i < count; i++) {
    const a = (offsetDeg + (360 / count) * i) * DEG
    const c = Math.cos(a)
    const s = Math.sin(a)
    pushSegment(
      verts,
      indices,
      cx + c * innerRadius,
      cy + s * innerRadius,
      cx + c * outerRadius,
      cy + s * outerRadius,
      thickness
    )
  }
}

/** Corner bracket. `dirX`/`dirY` are +1/-1 and point the arms inward. */
export function pushBracket(
  verts: number[],
  indices: number[],
  cx: number,
  cy: number,
  armX: number,
  armY: number,
  thickness: number,
  dirX: number,
  dirY: number
): void {
  pushRect(verts, indices, cx + (dirX * armX) / 2, cy, armX, thickness)
  pushRect(verts, indices, cx, cy + (dirY * armY) / 2, thickness, armY)
}

/** Downward chevron, apex at (cx, cy) — the dock return vector glyph. */
export function pushChevron(
  verts: number[],
  indices: number[],
  cx: number,
  cy: number,
  width: number,
  height: number,
  thickness: number
): void {
  const hw = width * 0.5
  pushSegment(verts, indices, cx - hw, cy + height, cx, cy, thickness)
  pushSegment(verts, indices, cx, cy, cx + hw, cy + height, thickness)
}

/** A glowing HUD element: one mesh, one cloned pass, animatable intensity. */
export class GlowElement {
  readonly object: SceneObject
  readonly visual: RenderMeshVisual
  private readonly builder: MeshBuilder
  private readonly pass: Pass
  private readonly transform: Transform
  private color: Rgb
  private intensity: number = 1

  constructor(
    object: SceneObject,
    visual: RenderMeshVisual,
    builder: MeshBuilder,
    pass: Pass,
    color: Rgb
  ) {
    this.object = object
    this.visual = visual
    this.builder = builder
    this.pass = pass
    this.transform = object.getTransform()
    this.color = color
    this.flush()
  }

  setColor(color: Rgb): GlowElement {
    this.color = color
    this.flush()
    return this
  }

  setIntensity(intensity: number): GlowElement {
    this.intensity = intensity < 0 ? 0 : intensity
    this.flush()
    return this
  }

  getIntensity(): number {
    return this.intensity
  }

  setVisible(visible: boolean): GlowElement {
    this.object.enabled = visible
    return this
  }

  setLocalPosition(x: number, y: number, z: number = 0): GlowElement {
    this.transform.setLocalPosition(new vec3(x, y, z))
    return this
  }

  setRotationDeg(deg: number): GlowElement {
    this.transform.setLocalRotation(quat.angleAxis(deg * DEG, vec3.forward()))
    return this
  }

  setUniformScale(scale: number): GlowElement {
    this.transform.setLocalScale(new vec3(scale, scale, scale))
    return this
  }

  /** Replace the geometry in place — used by gauges that change length. */
  rebuild(verts: number[], indices: number[]): GlowElement {
    const vCount = this.builder.getVerticesCount()
    const iCount = this.builder.getIndicesCount()
    if (iCount > 0) {
      this.builder.eraseIndices(0, iCount)
    }
    if (vCount > 0) {
      this.builder.eraseVertices(0, vCount)
    }
    if (verts.length > 0) {
      this.builder.appendVerticesInterleaved(verts)
      this.builder.appendIndices(indices)
    }
    this.builder.updateMesh()
    return this
  }

  /**
   * Additive blending consumes premultiplied RGB, so intensity rides on the
   * colour channels and alpha stays at 1.
   */
  private flush(): void {
    const i = this.intensity
    this.pass.baseColor = new vec4(this.color.r * i, this.color.g * i, this.color.b * i, 1)
  }
}

/** Creates glowing geometry and illuminated text from one shared source material. */
export class GlowFactory {
  private readonly source: Material

  constructor(source: Material) {
    this.source = source
  }

  build(
    parent: SceneObject,
    name: string,
    verts: number[],
    indices: number[],
    color: Rgb,
    renderOrder: number = 0
  ): GlowElement {
    const so = global.scene.createSceneObject(name)
    so.setParent(parent)
    so.layer = parent.layer

    const builder = new MeshBuilder(VERTEX_LAYOUT)
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    builder.appendVerticesInterleaved(verts)
    builder.appendIndices(indices)

    const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = builder.getMesh()
    builder.updateMesh()

    const mat = this.source.clone()
    rmv.clearMaterials()
    rmv.addMaterial(mat)
    rmv.renderOrder = renderOrder

    const pass = mat.mainPass
    pass.blendMode = BlendMode.Add
    pass.depthTest = false
    pass.depthWrite = false
    pass.twoSided = true

    return new GlowElement(so, rmv, builder, pass, color)
  }
}

export type HudTextAlign = "left" | "center" | "right"

/** Illuminated readout text — additive, no depth test, terminal font. */
export class GlowText {
  readonly object: SceneObject
  readonly text: Text
  private color: Rgb
  private intensity: number = 1

  constructor(text: Text, color: Rgb) {
    this.object = text.getSceneObject()
    this.text = text
    this.color = color
    this.flush()
  }

  setContent(content: string): GlowText {
    this.text.text = content
    return this
  }

  setColor(color: Rgb): GlowText {
    this.color = color
    this.flush()
    return this
  }

  setIntensity(intensity: number): GlowText {
    this.intensity = intensity < 0 ? 0 : intensity
    this.flush()
    return this
  }

  setVisible(visible: boolean): GlowText {
    this.object.enabled = visible
    return this
  }

  private flush(): void {
    const i = this.intensity
    this.text.textFill.color = new vec4(this.color.r * i, this.color.g * i, this.color.b * i, 1)
  }
}

export function makeGlowText(
  parent: SceneObject,
  name: string,
  content: string,
  size: number,
  color: Rgb,
  align: HudTextAlign,
  font: Font | null,
  x: number,
  y: number,
  renderOrder: number = 20
): GlowText {
  const so = global.scene.createSceneObject(name)
  so.setParent(parent)
  so.layer = parent.layer
  so.getTransform().setLocalPosition(new vec3(x, y, 0))

  const text = so.createComponent("Component.Text") as Text
  text.text = content
  text.size = size
  if (font) {
    text.font = font
  }
  text.depthTest = false
  text.blendMode = BlendMode.Add
  text.renderOrder = renderOrder
  text.verticalAlignment = VerticalAlignment.Center
  text.horizontalOverflow = HorizontalOverflow.Overflow
  text.verticalOverflow = VerticalOverflow.Overflow
  text.letterSpacing = 0.08
  // Left/Right align against the layout rect, not the object origin, so a rect
  // anchored at x = 0 is required or the glyphs drift off-screen.
  if (align === "left") {
    text.horizontalAlignment = HorizontalAlignment.Left
    text.worldSpaceRect = Rect.create(0, 24, -2, 2)
  } else if (align === "right") {
    text.horizontalAlignment = HorizontalAlignment.Right
    text.worldSpaceRect = Rect.create(-24, 0, -2, 2)
  } else {
    text.horizontalAlignment = HorizontalAlignment.Center
  }

  return new GlowText(text, color)
}
