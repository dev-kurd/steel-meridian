# Walker build listener: runs inside Blender. Polls jobs/*.py, runs each once, writes jobs/<name>.done or .fail with the log.
# Start it from Blender's Python console:
#   exec(open(r"C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Walkers\listener.py").read())
# Stop it by closing Blender (or run: bpy.app.timers.unregister(_walker_tick))
import bpy, os, io, time, traceback, contextlib
WALKER_ROOT = r"C:\Users\khala\Desktop\temp\Game Dev\StateOfWar-Walkers"
_JOBS = os.path.join(WALKER_ROOT, "jobs")

def _walker_tick():
    try:
        names = sorted(n for n in os.listdir(_JOBS) if n.endswith(".py"))
        if names:
            name = names[0]; base = name[:-3]
            src_path = os.path.join(_JOBS, name); run_path = os.path.join(_JOBS, base + ".running")
            os.replace(src_path, run_path)
            log = io.StringIO(); ok = True; t = time.time()
            try:
                src = open(run_path, encoding="utf-8").read()
                with contextlib.redirect_stdout(log):
                    exec(compile(src, name, "exec"), {"__name__": "__main__", "ROOT": WALKER_ROOT})
            except Exception:
                ok = False; log.write(traceback.format_exc())
            with open(os.path.join(_JOBS, base + (".done" if ok else ".fail")), "w", encoding="utf-8") as f:
                f.write(log.getvalue() + "\n[%.1fs]" % (time.time() - t))
            os.remove(run_path)
    except Exception:
        traceback.print_exc()
    return 0.5

if bpy.app.timers.is_registered(_walker_tick) is False:
    bpy.app.timers.register(_walker_tick, persistent=True)
with open(os.path.join(WALKER_ROOT, "listener.started"), "w") as f:
    f.write("%s %s" % (bpy.app.version_string, time.ctime()))
print("Walker listener running:", WALKER_ROOT)
