#!/bin/bash
# usage: run_job.sh <name> <timeout_s>   (job body on stdin)  -> waits for the Blender listener to finish it and prints the log
cd "$HOME/mnt/StateOfWar-Walkers"
name="$1_$(date +%H%M%S)"; t="${2:-150}"
rm -f "jobs/$name.done" "jobs/$name.fail" 2>/dev/null
{ echo 'import os, time, bpy'; echo 'ns = {}'; echo 'exec(open(os.path.join(ROOT, "walker_lib.py"), encoding="utf-8").read(), ns)'; echo 'OUT = os.path.join(ROOT, "out")'; cat; } > "jobs/$name.tmp"
mv "jobs/$name.tmp" "jobs/$name.py"
for i in $(seq 1 $((t*2))); do
  if [ -f "jobs/$name.done" ]; then echo "== DONE"; tail -c 3000 "jobs/$name.done"; exit 0; fi
  if [ -f "jobs/$name.fail" ]; then echo "== FAIL"; tail -c 4000 "jobs/$name.fail"; exit 1; fi
  sleep 0.5
done
echo "== TIMEOUT (still running)"; ls jobs
