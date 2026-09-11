// dnd-helper —— 让 Electron(FileDock) 能把"文本"真·拖出到任意文本框/聊天框。
// 原理：宿主（渲染层按住卡片→主进程）把文本/富文本临时写入文件，再启动本进程；
// 本进程以 WinForms Control.DoDragDrop 发起系统级 OLE 拖放（CF_UNICODETEXT + CF_HTML）。
// 用法：dnd-helper.exe --text <file> [--html <file>] [--title <text>]
using System.Text;

namespace DndHelper;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        if (Array.Exists(args, a => a.Equals("--serve", StringComparison.OrdinalIgnoreCase)))
            return Serve();
        return OneShot(args);
    }

    // 一次性模式（旧用法，保留用于手动测试）
    static int OneShot(string[] args)
    {
        try
        {
            string textFile = Arg(args, "--text") ?? "";
            string htmlFile = Arg(args, "--html") ?? "";
            string text = File.Exists(textFile) ? File.ReadAllText(textFile, Encoding.UTF8) : "";
            string html = File.Exists(htmlFile) ? File.ReadAllText(htmlFile, Encoding.UTF8) : "";
            if (text.Length == 0 && html.Length == 0) return 2;
            return DoDrag(text, html) ? 0 : 3;
        }
        catch (Exception ex)
        {
            try { File.WriteAllText(Path.Combine(Path.GetTempPath(), "dnd-helper.err"), ex.ToString()); } catch { }
            return 1;
        }
    }

    // 常驻服务：预热，读到 stdin 一行（tab 分隔 textFile/htmlFile）立即 DoDragDrop，结果写一行
    static int Serve()
    {
        using var f = MakeSourceForm();
        f.Show();
        f.Update();
        using var stdin = Console.OpenStandardInput();
        using var sr = new StreamReader(stdin, Encoding.UTF8);
        while (true)
        {
            string line = sr.ReadLine();
            if (line == null) break; // 宿主退出
            string[] parts = line.Split('\t');
            string tf = parts.Length > 0 ? parts[0] : "";
            string hf = parts.Length > 1 ? parts[1] : "";
            string text = File.Exists(tf) ? File.ReadAllText(tf, Encoding.UTF8) : "";
            string html = File.Exists(hf) ? File.ReadAllText(hf, Encoding.UTF8) : "";
            try
            {
                // 源窗始终跟随当前光标，保证拖动即时开始
                f.Location = new Point(Cursor.Position.X, Cursor.Position.Y);
                f.Update();
                bool ok = DoDrag(text, html);
                Console.WriteLine(ok ? "OK" : "CANCEL");
                Console.Out.Flush();
            }
            catch (Exception ex)
            {
                try { Console.WriteLine("ERR " + ex.Message); Console.Out.Flush(); } catch { }
            }
        }
        return 0;
    }

    static Form MakeSourceForm()
    {
        return new Form
        {
            ShowInTaskbar = false,
            FormBorderStyle = FormBorderStyle.None,
            StartPosition = FormStartPosition.Manual,
            Opacity = 0,
            Size = new Size(2, 2),
            Location = new Point(Cursor.Position.X, Cursor.Position.Y),
            TopMost = true,
        };
    }

    static bool DoDrag(string text, string html)
    {
        if (text.Length == 0 && html.Length == 0) return false;
        DataObject data = new DataObject();
        if (text.Length > 0) data.SetText(text, TextDataFormat.UnicodeText);
        if (html.Length > 0) data.SetData("HTML Format", WrapHtml(html));
        using var f = MakeSourceForm();
        f.Location = new Point(Cursor.Position.X, Cursor.Position.Y);
        f.Show();
        f.Update();
        var res = f.DoDragDrop(data, DragDropEffects.Copy | DragDropEffects.Move | DragDropEffects.Link);
        f.Close();
        return (res & DragDropEffects.Copy) != 0 || (res & DragDropEffects.Move) != 0;
    }

    static string Arg(string[] args, string key)
    {
        for (int i = 0; i < args.Length - 1; i++)
            if (string.Equals(args[i], key, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        return null;
    }

    // CF_HTML 需要 Clipboard HTML 头（StartHTML/EndHTML 等偏移）
    static string WrapHtml(string body)
    {
        const string header =
            "Version:0.9\r\nStartHTML:{0:000000}\r\nEndHTML:{1:000000}\r\nStartFragment:{2:000000}\r\nEndFragment:{3:000000}\r\n";
        string fragment = body;
        // 占位长度计算（8 位定长）
        int headerLen = string.Format(header, 0, 0, 0, 0).Length;
        int startHtml = headerLen;
        int startFragment = headerLen;
        int endFragment = headerLen + fragment.Length;
        int endHtml = endFragment;
        string full = string.Format(header, startHtml, endHtml, startFragment, endFragment) + fragment;
        return full;
    }
}
