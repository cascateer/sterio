import { SampleRegistry } from "@cascateer/core";
import { scan, Subject } from "rxjs";

declare global {
  namespace Sample {
    interface Components {
      sample1: Sample.Component;
      sample2: Sample.Component;
      sample3: Sample.Component;
    }
  }
}

SampleRegistry.register({
  sample1() {
    return <>{"sample1"}</>;
  },
  sample2() {
    return <input type="text" />;
  },
  sample3() {
    const toggle = new Subject<void>();

    return (
      <>
        <button type="button" onClick={() => toggle.next()}></button>
        <input
          type="checkbox"
          checked={toggle.pipe(scan((acc) => !acc, false))}
        />
      </>
    );
  },
});
