using System;
using System.IO;
using System.Net;
using System.Text;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEngine;
using UnityModManagerNet;
using Kingmaker.Code.UI.MVVM.VM.Dialog.Dialog;
using Kingmaker.Code.UI.MVVM.View.Dialog.Dialog;
using Kingmaker.Code.UI.MVVM.View.Dialog.BookEvent;

namespace FoxForgeVote {
    public class Config { public string url, key; public bool enabled, autoSelect; }
    public class Reply { public string round; public int? winner; }
    public class Row {
        public AnswerVM vm;
        public string text;
        public int index;
    }
    public static class Entry {
        static Config cfg;
        static UnityModManager.ModEntry mod;
        static List<Row> active = new List<Row>();
        static string round;
        static bool handled;
        static float next;
        static Task<Reply> request;
        static bool reported;
        static bool running;

        public static bool Load(UnityModManager.ModEntry entry) {
            mod = entry;
            var file = Path.Combine(entry.Path, "settings.json");
            if (File.Exists(file)) cfg = JsonConvert.DeserializeObject<Config>(File.ReadAllText(file));
            running = true;
            entry.OnUpdate = Update;
            entry.OnToggle = (unused, on) => { running = on; Reset(); return true; };
            return true;
        }

        static void Reset() { active.Clear(); round = null; handled = false; }
        static List<Row> ReadRows() {
            var rows = new List<Row>();
            foreach (var view in UnityEngine.Object.FindObjectsByType<DialogAnswerPCView>(FindObjectsSortMode.None)) {
                if (view.isActiveAndEnabled) Add(rows, view, view.Text.text);
            }
            foreach (var view in UnityEngine.Object.FindObjectsByType<BookEventAnswerPCView>(FindObjectsSortMode.None)) {
                if (view.isActiveAndEnabled) Add(rows, view, view.Text.text);
            }
            return rows.OrderBy(r => r.index).ToList();
        }

        static void Add(List<Row> rows, object view, string label) {
            // ViewModel is inherited and can be protected in Owlcat's UI framework.
            var prop = view.GetType().GetProperty("ViewModel", System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
            var vm = prop == null ? null : prop.GetValue(view, null) as AnswerVM;
            if (vm == null || !vm.Enable.Value || vm.IsSystem || String.IsNullOrWhiteSpace(label)) return;
            label = System.Text.RegularExpressions.Regex.Replace(label, "<[^>]+>", "");
            rows.Add(new Row { vm = vm, text = label, index = vm.Index });
        }

        static void Update(UnityModManager.ModEntry unused, float dt) {
            if (!running || cfg == null || !cfg.enabled || Time.unscaledTime < next) return;
            next = Time.unscaledTime + 0.5f;
            try {
                var rows = ReadRows();
                if (rows.Count < 2 || rows.Select(r => r.index).Distinct().Count() != rows.Count) rows.Clear();
                if (!rows.Select(r=>r.vm).SequenceEqual(active.Select(r=>r.vm)) ||
                    !rows.Select(r=>r.text).SequenceEqual(active.Select(r=>r.text))) {
                    active = rows;
                    round = rows.Count == 0 ? null : Guid.NewGuid().ToString("N");
                    handled = false;
                }
                if (request != null) {
                    if (!request.IsCompleted) return;
                    var finished = request;
                    request = null;
                    var result = finished.GetAwaiter().GetResult();
                    reported = false;
                    if (!handled && round != null && result.round == round && result.winner.HasValue) {
                        var choice = active.SingleOrDefault(r => r.index == result.winner.Value);
                        handled = true;
                        if (choice != null) {
                            mod.Logger.Log("Chat chose: " + choice.text);
                            if (cfg.autoSelect) choice.vm.OnChooseAnswer();
                        }
                        return;
                    }
                }
                var payload = JsonConvert.SerializeObject(new { round, choices = active.Select(r=>new { id=r.index, r.text }) });
                request = Task.Run(()=>Sync(payload));
            } catch (Exception e) {
                ResetIfLocalFailure(e);
                if (!reported) mod.Logger.Log("Voting paused: " + e.GetBaseException().Message);
                reported = true;
                next = Time.unscaledTime + 2f;
            }
        }

        static void ResetIfLocalFailure(Exception ex) {
            if (!(ex is WebException) && !(ex is IOException)) Reset();
        }
        static Reply Sync(string payload) {
            var req = (HttpWebRequest)WebRequest.Create(cfg.url);
            req.Method = "POST"; req.ContentType = "application/json";
            req.AllowAutoRedirect = false; req.Timeout = 4000; req.ReadWriteTimeout = 4000;
            req.Headers["Authorization"] = "Bearer " + cfg.key;
            var bytes = Encoding.UTF8.GetBytes(payload);
            using (var stream = req.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
            using (var response = req.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return JsonConvert.DeserializeObject<Reply>(reader.ReadToEnd());
        }
    }
}


