import { createRoot } from "@cascateer/core";
import { CubeComponent } from "../src/slices/Rubiks/Cube/component";
import { CubeActionsComponent } from "../src/slices/Rubiks/CubeActions/component";
import { CubeControlsComponent } from "../src/slices/Rubiks/CubeControls/component";

createRoot(document.body).render(
  <>
    <CubeComponent />
    <CubeActionsComponent />
    <CubeControlsComponent />
  </>,
);
