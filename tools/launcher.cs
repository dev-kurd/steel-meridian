// Steel Meridian launcher.
// The whole game (page, script, assets, sounds) is packed inside this exe as game.zip.
// On start it unpacks the game to %LOCALAPPDATA%\SteelMeridian\app (only when the build changes),
// then opens it in its own window using the Microsoft Edge engine that ships with Windows.
// Saves, settings and campaign progress live in %LOCALAPPDATA%\SteelMeridian\profile.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

static class Program
{
    const string Build = "@BUILD@";

    [STAThread]
    static int Main()
    {
        try
        {
            string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SteelMeridian");
            string app = Path.Combine(root, "app"), marker = Path.Combine(app, ".build");
            if (!File.Exists(marker) || File.ReadAllText(marker) != Build) Unpack(app, marker);

            string page = Path.Combine(app, "index.html");
            string url = new Uri(page).AbsoluteUri;
            string browser = FindBrowser();
            if (browser == null)
            {
                // No Edge or Chrome found: fall back to whatever opens .html files.
                Process.Start(new ProcessStartInfo(page) { UseShellExecute = true });
                return 0;
            }
            string profile = Path.Combine(root, "profile");
            Directory.CreateDirectory(profile);
            string args = "--app=\"" + url + "\" --user-data-dir=\"" + profile + "\" --window-size=1600,900"
                        + " --no-first-run --no-default-browser-check --disable-sync --allow-file-access-from-files" // the last switch lets the page read its assets folder from disk
                        + " --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling";
            Process.Start(new ProcessStartInfo(browser, args) { UseShellExecute = false });
            return 0;
        }
        catch (Exception e)
        {
            MessageBox.Show("Steel Meridian could not start.\n\n" + e.Message, "Steel Meridian", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    static void Unpack(string app, string marker)
    {
        Directory.CreateDirectory(app);
        string full = Path.GetFullPath(app) + Path.DirectorySeparatorChar;
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("game.zip"))
        using (ZipArchive zip = new ZipArchive(s, ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry e in zip.Entries)
            {
                string target = Path.GetFullPath(Path.Combine(app, e.FullName.Replace('/', Path.DirectorySeparatorChar)));
                if (!target.StartsWith(full, StringComparison.OrdinalIgnoreCase)) continue; // never write outside the game folder
                if (e.FullName.EndsWith("/") || e.FullName.EndsWith("\\")) { Directory.CreateDirectory(target); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(target));
                e.ExtractToFile(target, true);
            }
        }
        File.WriteAllText(marker, Build);
    }

    static string FindBrowser()
    {
        string[] names = { "msedge.exe", "chrome.exe" };
        foreach (string name in names)
        {
            foreach (RegistryKey hive in new[] { Registry.LocalMachine, Registry.CurrentUser })
            {
                try
                {
                    using (RegistryKey k = hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + name))
                    {
                        string p = k == null ? null : k.GetValue(null) as string;
                        if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p;
                    }
                }
                catch { }
            }
        }
        string[] guesses = {
            Environment.ExpandEnvironmentVariables(@"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
            Environment.ExpandEnvironmentVariables(@"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            Environment.ExpandEnvironmentVariables(@"%ProgramFiles%\Google\Chrome\Application\chrome.exe")
        };
        foreach (string g in guesses) if (File.Exists(g)) return g;
        return null;
    }
}
