using System;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class Program
{
    private static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        var exeDir = AppDomain.CurrentDomain.BaseDirectory;
        var project = FindProjectRoot(exeDir);
        if (project == null)
        {
            Console.WriteLine("หาโฟลเดอร์โปรเจกต์ไม่เจอ (ต้องมี package.json และไฟล์ .env)");
            Console.WriteLine("วาง ResetAdminPassword.exe ไว้ที่รากโปรเจกต์ website");
            Wait();
            return 1;
        }

        Directory.SetCurrentDirectory(project);
        Console.WriteLine("MinutesLearn — สุ่มรหัสแอดมินใหม่");
        Console.WriteLine("ใช้ฐานข้อมูลตามไฟล์ .env ในโฟลเดอร์นี้");
        Console.WriteLine(project);
        Console.WriteLine();
        Console.Write("กด Enter เพื่อสุ่มรหัส (Ctrl+C เพื่อยกเลิก) ");
        Console.ReadLine();
        Console.WriteLine();

        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/c npx tsx scripts/reset-admin-password.ts",
            WorkingDirectory = project,
            UseShellExecute = false,
        };

        try
        {
            var proc = Process.Start(psi);
            if (proc == null)
            {
                Console.WriteLine("เปิดคำสั่งไม่สำเร็จ");
                Wait();
                return 1;
            }
            proc.WaitForExit();
            Wait();
            return proc.ExitCode;
        }
        catch (Exception ex)
        {
            Console.WriteLine("รันไม่สำเร็จ: " + ex.Message);
            Wait();
            return 1;
        }
    }

    private static string FindProjectRoot(string start)
    {
        var dir = new DirectoryInfo(start);
        for (var i = 0; i < 4 && dir != null; i++)
        {
            var pkg = Path.Combine(dir.FullName, "package.json");
            var script = Path.Combine(dir.FullName, "scripts", "reset-admin-password.ts");
            if (File.Exists(pkg) && File.Exists(script)) return dir.FullName;
            dir = dir.Parent;
        }
        return null;
    }

    private static void Wait()
    {
        Console.WriteLine();
        Console.Write("กด Enter เพื่อปิด ");
        Console.ReadLine();
    }
}
