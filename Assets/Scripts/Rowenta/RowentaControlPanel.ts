/**
 * Kept so the existing scene component still loads.
 * The pinch menu is built inside HelmetHud (head-locked visor).
 * Do not add a second world-space panel here.
 */
@component
export class RowentaControlPanel extends BaseScriptComponent {
  onAwake(): void {
    print("[RowentaControlPanel] Controls live on the helmet visor.")
  }
}
