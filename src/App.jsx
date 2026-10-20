const { useEffect, useMemo, useState } = React;

    const money = (amount, currency = "USD") => {
      try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount) || 0); }
      catch { return `${currency} ${(Number(amount) || 0).toFixed(2)}`; }
    };
    const today = () => new Date().toISOString().slice(0, 10);
    const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const blankBusiness = () => ({ businessName: "", email: "", phone: "", address: "", taxOrRegistrationNumber: "" });
    const blankClient = () => ({ name: "", businessName: "", email: "", phone: "", billingAddress: "" });
    const blankLine = () => ({ id: uid(), description: "", quantity: "1", unitPrice: "0" });
    const blankInvoice = (currency = "USD") => ({
      clientId: "", invoiceNumber: "", issueDate: today(), dueDate: today(), currencyCode: currency,
      status: "draft", taxRate: "", notes: "", lineItems: [blankLine()]
    });

    function getPrefs() {
      try {
        const p = JSON.parse(localStorage.getItem("invoiceApp.preferences") || "{}");
        return { sort: p.sort || "issueDate", direction: p.direction || "desc", filter: p.filter || "all", currency: p.currency || "USD", remember: p.remember !== false };
      } catch { return { sort: "issueDate", direction: "desc", filter: "all", currency: "USD", remember: true }; }
    }
    function savePrefs(p) {
      try { localStorage.setItem("invoiceApp.preferences", JSON.stringify(p)); } catch {}
    }

    function App() {
      const [user, setUser] = useState(null);
      const [authLoading, setAuthLoading] = useState(true);
      const [page, setPage] = useState("dashboard");
      const [authMode, setAuthMode] = useState("login");
      const [authBusy, setAuthBusy] = useState(false);
      const [authError, setAuthError] = useState("");
      const [authNotice, setAuthNotice] = useState("");
      const [authValues, setAuthValues] = useState({ name: "", email: "", password: "" });
      const [showPassword, setShowPassword] = useState(false);
      const [prefs, setPrefs] = useState(getPrefs);
      const [business, setBusiness] = useState(blankBusiness());
      const [profileId, setProfileId] = useState(null);
      const [clients, setClients] = useState([]);
      const [invoices, setInvoices] = useState([]);
      const [dataLoading, setDataLoading] = useState(false);
      const [dataError, setDataError] = useState("");
      const [search, setSearch] = useState("");
      const [editingClient, setEditingClient] = useState(null);
      const [clientForm, setClientForm] = useState(blankClient());
      const [clientError, setClientError] = useState("");
      const [clientBusy, setClientBusy] = useState(false);
      const [invoiceDraft, setInvoiceDraft] = useState(null);
      const [editingInvoiceId, setEditingInvoiceId] = useState(null);
      const [viewInvoice, setViewInvoice] = useState(null);
      const [invoiceError, setInvoiceError] = useState("");
      const [invoiceBusy, setInvoiceBusy] = useState(false);
      const [dialog, setDialog] = useState(null);
      const [dialogBusy, setDialogBusy] = useState(false);
      const [dialogError, setDialogError] = useState("");
      const [adminUsers, setAdminUsers] = useState([]);
      const [adminRequests, setAdminRequests] = useState([]);
      const [adminError, setAdminError] = useState("");
      const [resetForm, setResetForm] = useState({ email: "", password: "" });
      const [adminMessage, setAdminMessage] = useState("");

      useEffect(() => {
        let live = true;
        (async () => {
          try {
            if (!window.VPAuth) throw new Error("Authentication service is not ready.");
            const current = await window.VPAuth.me();
            if (live) { setUser(current || null); setAuthLoading(false); }
          } catch (e) {
            if (live) { setUser(null); setAuthLoading(false); setAuthError(e?.message || "Could not check your session. Please try again."); }
          }
        })();
        return () => { live = false; };
      }, []);

      useEffect(() => { savePrefs(prefs); }, [prefs]);

      const records = async (collection) => {
        if (!window.VPData) throw new Error("Your data service is not ready. Please retry.");
        const rows = await window.VPData.list(collection, { mine: true });
        return Array.isArray(rows) ? rows.map(r => ({ id: r.id, ...(r.data || {}) })) : [];
      };

      const loadData = async () => {
        if (!user) return;
        setDataLoading(true); setDataError("");
        try {
          const [ps, cs, is] = await Promise.all([records("profiles"), records("clients"), records("invoices")]);
          setClients(cs.sort((a,b) => (a.name || "").localeCompare(b.name || "")));
          setInvoices(is);
          const p = ps[0];
          if (p) { setBusiness({ ...blankBusiness(), ...p }); setProfileId(p.id); }
          else { setBusiness(blankBusiness()); setProfileId(null); }
        } catch (e) {
          setDataError(e?.message || "We couldn’t load your account data. Please retry.");
        } finally { setDataLoading(false); }
      };

      useEffect(() => { if (user) loadData(); }, [user?.id]);

      useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") { setDialog(null); setDialogError(""); } };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }, []);

      const changePrefs = (next) => setPrefs(p => ({ ...p, ...next }));
      const setAuthField = (key, value) => setAuthValues(v => ({ ...v, [key]: value }));

      const submitAuth = async (e) => {
        e.preventDefault(); setAuthError(""); setAuthNotice("");
        const email = authValues.email.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAuthError("Enter a valid email address."); return; }
        if (authMode !== "forgot" && !authValues.password) { setAuthError("Enter your password."); return; }
        if (authMode === "register") {
          if (!authValues.name.trim()) { setAuthError("Enter your name."); return; }
          if (authValues.password.length < 8 || !/[A-Za-z]/.test(authValues.password) || !/\d/.test(authValues.password)) {
            setAuthError("Password must be at least 8 characters and include a letter and a number."); return;
          }
        }
        setAuthBusy(true);
        try {
          if (authMode === "forgot") {
            await window.VPAuth.requestReset(email);
            setAuthNotice("If an account matches that email, password reset instructions will be sent. You can safely try signing in.");
          } else {
            const result = authMode === "register"
              ? await window.VPAuth.register(email, authValues.password, authValues.name.trim())
              : await window.VPAuth.login(email, authValues.password);
            setUser(result);
            setAuthValues(v => ({ ...v, password: "" }));
            setPage("dashboard");
          }
        } catch (e) { setAuthError(e?.message || "Something went wrong. Please try again."); }
        finally { setAuthBusy(false); }
      };

      const signOut = async () => {
        try { await window.VPAuth.logout(); } catch {}
        setUser(null); setPage("dashboard"); setInvoices([]); setClients([]); setBusiness(blankBusiness());
        setAuthMode("login"); setAuthValues(v => ({ ...v, password: "" }));
      };

      const saveBusiness = async (e) => {
        e.preventDefault();
        if (!business.businessName.trim() || !business.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business.email)) {
          setDataError("Business name and a valid business email are required."); return;
        }
        setDataError(""); setDataLoading(true);
        try {
          const payload = { ...business, businessName: business.businessName.trim(), email: business.email.trim() };
          if (profileId) await window.VPData.update("profiles", profileId, payload);
          else {
            const id = await window.VPData.add("profiles", payload);
            if (typeof id === "string") setProfileId(id);
          }
          await loadData(); setPage("profile");
        } catch (e) { setDataError(e?.message || "Could not save your business details. Your edits are still here."); setDataLoading(false); }
      };

      const openClient = (client = null) => {
        setEditingClient(client?.id || null);
        setClientForm(client ? { ...blankClient(), ...client } : blankClient());
        setClientError(""); setPage("client-form");
      };
      const saveClient = async (e) => {
        e.preventDefault(); setClientError("");
        if (!clientForm.name.trim()) return setClientError("Client name is required.");
        if (!clientForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientForm.email)) return setClientError("Enter a valid client email.");
        setClientBusy(true);
        try {
          const payload = { ...clientForm, name: clientForm.name.trim(), email: clientForm.email.trim(), updatedAt: new Date().toISOString() };
          if (editingClient) await window.VPData.update("clients", editingClient, payload);
          else await window.VPData.add("clients", { ...payload, createdAt: new Date().toISOString() });
          await loadData(); setPage("clients");
        } catch (e) { setClientError(e?.message || "Could not save this client. Please retry."); }
        finally { setClientBusy(false); }
      };
      const deleteClient = async (client) => {
        const hasInvoices = invoices.some(i => i.clientId === client.id);
        if (hasInvoices) { setDialog({ title: "Client is in use", message: "This client has invoices and cannot be removed. Keep the client to preserve invoice history.", kind: "info" }); return; }
        setDialog({ title: "Delete client?", message: `Delete ${client.name}? This action cannot be undone.`, kind: "client", id: client.id });
        setDialogError("");
      };

      const openNewInvoice = () => {
        setInvoiceError("");
        if (!clients.length) { setDialog({ title: "Add a client first", message: "Invoices need a client. Add your first client, then come back to create an invoice.", kind: "add-client" }); return; }
        setEditingInvoiceId(null); setInvoiceDraft(blankInvoice(prefs.currency)); setPage("editor");
      };
      const openEditInvoice = (invoice) => {
        setEditingInvoiceId(invoice.id);
        setInvoiceDraft({
          ...blankInvoice(prefs.currency), ...invoice,
          lineItems: (invoice.lineItems || []).map(x => ({ ...x, quantity: String(x.quantity ?? 1), unitPrice: String(x.unitPrice ?? 0) }))
        });
        setInvoiceError(""); setPage("editor");
      };
      const updateDraft = (key, value) => setInvoiceDraft(d => ({ ...d, [key]: value }));
      const updateLine = (id, key, value) => setInvoiceDraft(d => ({ ...d, lineItems: d.lineItems.map(l => l.id === id ? { ...l, [key]: value } : l) }));
      const totals = useMemo(() => {
        const lines = (invoiceDraft?.lineItems || []).map(l => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
        const subtotal = lines.reduce((a,b) => a+b, 0);
        const taxRate = Math.max(0, Number(invoiceDraft?.taxRate) || 0);
        const taxAmount = subtotal * taxRate / 100;
        return { subtotal, taxAmount, total: subtotal + taxAmount };
      }, [invoiceDraft]);

      const saveInvoice = async (e) => {
        e.preventDefault(); setInvoiceError("");
        if (!invoiceDraft) return;
        if (!invoiceDraft.clientId) return setInvoiceError("Choose a client.");
        if (!invoiceDraft.invoiceNumber.trim()) return setInvoiceError("Invoice number is required.");
        if (!invoiceDraft.issueDate || !invoiceDraft.dueDate) return setInvoiceError("Issue and due dates are required.");
        if (invoiceDraft.dueDate < invoiceDraft.issueDate) return setInvoiceError("Due date cannot be before the issue date.");
        if (!invoiceDraft.lineItems.length || invoiceDraft.lineItems.some(l => !l.description.trim() || Number(l.quantity) <= 0 || Number(l.unitPrice) < 0 || !Number.isFinite(Number(l.quantity)) || !Number.isFinite(Number(l.unitPrice)))) {
          return setInvoiceError("Each line needs a description, a positive quantity, and a non-negative unit price.");
        }
        if (Number(invoiceDraft.taxRate) < 0 || Number(invoiceDraft.taxRate) > 100) return setInvoiceError("Tax rate must be between 0 and 100.");
        const duplicate = invoices.some(i => i.id !== editingInvoiceId && (i.invoiceNumber || "").toLowerCase() === invoiceDraft.invoiceNumber.trim().toLowerCase());
        if (duplicate) return setInvoiceError("That invoice number is already in use. Choose a unique number.");
        setInvoiceBusy(true);
        try {
          const now = new Date().toISOString();
          const lineItems = invoiceDraft.lineItems.map((l, position) => ({
            id: l.id || uid(), description: l.description.trim(), quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice), amount: Number(l.quantity) * Number(l.unitPrice), position
          }));
          const payload = {
            ...invoiceDraft, invoiceNumber: invoiceDraft.invoiceNumber.trim(), taxRate: invoiceDraft.taxRate === "" ? null : Number(invoiceDraft.taxRate),
            lineItems, subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total,
            updatedAt: now, ...(editingInvoiceId ? {} : { createdAt: now })
          };
          if (editingInvoiceId) await window.VPData.update("invoices", editingInvoiceId, payload);
          else await window.VPData.add("invoices", payload);
          changePrefs({ currency: invoiceDraft.currencyCode });
          await loadData(); setPage("dashboard"); setInvoiceDraft(null);
        } catch (e) { setInvoiceError(e?.message || "Could not save your invoice. Your changes are still here; please retry."); }
        finally { setInvoiceBusy(false); }
      };

      const updateStatus = async (invoice, status) => {
        try {
          await window.VPData.update("invoices", invoice.id, { ...invoice, status, updatedAt: new Date().toISOString() });
          await loadData();
          if (viewInvoice?.id === invoice.id) setViewInvoice({ ...invoice, status });
        } catch (e) { setDataError(e?.message || "Could not update invoice status. Please retry."); }
      };
      const deleteInvoice = (invoice) => { setDialog({ title: "Delete invoice?", message: `Delete invoice ${invoice.invoiceNumber}? This action cannot be undone.`, kind: "invoice", id: invoice.id }); setDialogError(""); };
      const confirmDialog = async () => {
        if (!dialog) return;
        if (dialog.kind === "info") { setDialog(null); return; }
        if (dialog.kind === "add-client") { setDialog(null); openClient(); return; }
        setDialogBusy(true); setDialogError("");
        try {
          if (dialog.kind === "invoice") await window.VPData.remove("invoices", dialog.id);
          if (dialog.kind === "client") await window.VPData.remove("clients", dialog.id);
          await loadData();
          if (viewInvoice?.id === dialog.id) { setViewInvoice(null); setPage("dashboard"); }
          setDialog(null);
        } catch (e) { setDialogError(e?.message || "This action failed. Please retry or cancel."); }
        finally { setDialogBusy(false); }
      };

      const openPreview = (invoice) => { setViewInvoice(invoice); setPage("preview"); };
      const clientById = id => clients.find(c => c.id === id);
      const filteredInvoices = useMemo(() => {
        const q = search.trim().toLowerCase();
        let list = invoices.filter(i => {
          const c = clients.find(x => x.id === i.clientId);
          const matchesQ = !q || `${i.invoiceNumber || ""} ${c?.name || ""} ${c?.email || ""}`.toLowerCase().includes(q);
          return matchesQ && (prefs.filter === "all" || i.status === prefs.filter);
        });
        const key = prefs.sort;
        list.sort((a,b) => {
          let av, bv;
          if (key === "client") { av = clientById(a.clientId)?.name || ""; bv = clientById(b.clientId)?.name || ""; }
          else if (key === "total") { av = Number(a.total) || 0; bv = Number(b.total) || 0; }
          else if (key === "status") { av = a.status || ""; bv = b.status || ""; }
          else { av = a[key] || ""; bv = b[key] || ""; }
          const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
          return prefs.direction === "asc" ? cmp : -cmp;
        });
        return list;
      }, [invoices, clients, search, prefs.sort, prefs.direction, prefs.filter]);

      const sortBy = (key) => changePrefs({ sort: key, direction: prefs.sort === key && prefs.direction === "asc" ? "desc" : "asc" });

      const loadAdmin = async () => {
        setAdminError("");
        try {
          const [u, r] = await Promise.all([window.VPAuth.adminListUsers(), window.VPAuth.adminListResetRequests()]);
          setAdminUsers(Array.isArray(u) ? u : []);
          setAdminRequests(Array.isArray(r) ? r : []);
        } catch (e) { setAdminError(e?.message || "Could not load admin information."); }
      };
      const resetPassword = async (e) => {
        e.preventDefault(); setAdminMessage(""); setAdminError("");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetForm.email)) return setAdminError("Enter a valid account email.");
        if (resetForm.password.length < 8 || !/[A-Za-z]/.test(resetForm.password) || !/\d/.test(resetForm.password)) return setAdminError("New password must be at least 8 characters and include a letter and a number.");
        try {
          const result = await window.VPAuth.adminResetPassword(resetForm.email.trim(), resetForm.password);
          setAdminMessage(result?.emailSent ? "Password reset and emailed to the account holder." : "Password reset, but the email could not be sent.");
          setResetForm({ email: "", password: "" }); await loadAdmin();
        } catch (e) { setAdminError(e?.message || "Could not reset the password."); }
      };

      const panel = "rounded-2xl border border-slate-200 bg-white shadow-sm";
      const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";
      const primary = "inline-flex items-center justify-center rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60";
      const secondary = "inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60";
      const danger = "inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50";
      const field = (label, node, hint = null) => <label className="block space-y-1.5"><span className="block text-sm font-medium text-slate-700">{label}</span>{node}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</label>;
      const alert = (text, type = "error") => text ? <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{text}</div> : null;
      const badge = status => {
        const cls = status === "paid" ? "bg-emerald-100 text-emerald-800" : status === "sent" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
        return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${cls}`}>{status || "draft"}</span>;
      };

      if (authLoading) return <div className="min-h-screen grid place-items-center p-6"><div className={`${panel} w-full max-w-sm p-8 text-center`}><div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-700" /><p className="text-sm text-slate-600">Checking your account…</p></div></div>;

      if (!user) return (
        <main className="min-h-screen px-4 py-10 sm:py-16">
          <div className="mx-auto max-w-md">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-blue-700 text-lg font-bold text-white">L</div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Ledgerly</h1>
              <p className="mt-2 text-sm text-slate-600">Simple, professional invoicing for your business.</p>
            </div>
            <section className={`${panel} p-6 sm:p-8`}>
              <h2 className="text-xl font-semibold text-slate-900">{authMode === "register" ? "Create your account" : authMode === "forgot" ? "Reset your password" : "Welcome back"}</h2>
              <p className="mt-1 mb-6 text-sm text-slate-500">{authMode === "forgot" ? "Enter your email and we’ll send reset instructions if an account matches." : authMode === "register" ? "Your business data stays private to your account." : "Sign in to manage your invoices."}</p>
              <form onSubmit={submitAuth} className="space-y-4" noValidate>
                {authMode === "register" && field("Your name", <input className={inputClass} autoComplete="name" value={authValues.name} onChange={e => setAuthField("name", e.target.value)} placeholder="Alex Morgan" />)}
                {field("Email address", <input className={inputClass} type="email" autoComplete="email" value={authValues.email} onChange={e => setAuthField("email", e.target.value)} placeholder="you@business.com" />)}
                {authMode !== "forgot" && field("Password", <div className="relative"><input className={`${inputClass} pr-20`} type={showPassword ? "text" : "password"} autoComplete={authMode === "register" ? "new-password" : "current-password"} value={authValues.password} onChange={e => setAuthField("password", e.target.value)} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword(x => !x)} className="absolute inset-y-0 right-3 text-xs font-semibold text-slate-600">{showPassword ? "Hide" : "Show"}</button></div>, authMode === "register" ? "At least 8 characters, including a letter and a number." : null)}
                {authMode === "login" && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={prefs.remember} onChange={e => changePrefs({ remember: e.target.checked })} className="h-4 w-4 rounded border-slate-300 accent-blue-700" />Remember me</label>}
                {authError && alert(authError)}
                {authNotice && alert(authNotice, "success")}
                <button className={`${primary} w-full`} disabled={authBusy} type="submit">{authBusy ? "Please wait…" : authMode === "register" ? "Create account" : authMode === "forgot" ? "Request reset" : "Sign in"}</button>
              </form>
              <div className="mt-5 flex flex-col gap-3 text-center text-sm">
                {authMode === "login" && <button className="font-medium text-blue-700 hover:text-blue-900" type="button" onClick={() => { setAuthMode("forgot"); setAuthError(""); setAuthNotice(""); }}>Forgot password?</button>}
                {authMode !== "register" && <p className="text-slate-600">New to Ledgerly? <button className="font-semibold text-blue-700 hover:text-blue-900" onClick={() => { setAuthMode("register"); setAuthError(""); setAuthNotice(""); }} type="button">Create an account</button></p>}
                {authMode !== "login" && <p className="text-slate-600">Already have an account? <button className="font-semibold text-blue-700 hover:text-blue-900" onClick={() => { setAuthMode("login"); setAuthError(""); setAuthNotice(""); }} type="button">Sign in</button></p>}
              </div>
            </section>
            {authError && <button className="mx-auto mt-4 block text-sm font-medium text-slate-600 underline" onClick={() => { setAuthError(""); setAuthLoading(true); window.VPAuth.me().then(u => { setUser(u || null); setAuthLoading(false); }).catch(() => setAuthLoading(false)); }}>Retry session check</button>}
          </div>
        </main>
      );

      const navItems = [{ id: "dashboard", label: "Invoices" }, { id: "clients", label: "Clients" }, { id: "profile", label: "Business profile" }];
      const title = page === "dashboard" ? "Invoices" : page === "clients" ? "Clients" : page === "profile" ? "Business profile" : page === "client-form" ? (editingClient ? "Edit client" : "Add client") : page === "editor" ? (editingInvoiceId ? "Edit invoice" : "New invoice") : page === "preview" ? "Invoice preview" : "Admin";
      const clientTable = (client) => <div key={client.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="font-semibold text-slate-900">{client.name}</p><p className="break-all text-sm text-slate-600">{client.email}</p>{(client.businessName || client.phone) && <p className="mt-1 text-xs text-slate-500">{[client.businessName, client.phone].filter(Boolean).join(" · ")}</p>}</div>
        <div className="flex gap-2"><button className={secondary} onClick={() => openClient(client)}>Edit</button><button className={danger} onClick={() => deleteClient(client)}>Delete</button></div>
      </div>;

      return (
        <div className="min-h-screen">
          <header className="no-print border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <button className="flex items-center gap-2" onClick={() => { setPage("dashboard"); setDialog(null); }} aria-label="Go to invoices">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-700 font-bold text-white">L</span><span className="font-bold tracking-tight text-slate-900">Ledgerly</span>
              </button>
              <div className="flex items-center gap-2">
                {user.isOwner && <button className={`${secondary} !px-3 !py-2 text-xs`} onClick={() => { setPage("admin"); loadAdmin(); }}>Admin</button>}
                <span className="hidden text-sm text-slate-600 sm:inline">{user.name || user.email}</span>
                <button className={`${secondary} !px-3 !py-2 text-xs`} onClick={signOut}>Sign out</button>
              </div>
            </div>
          </header>
          {page !== "preview" && <nav className="no-print border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
              {navItems.map(n => <button key={n.id} onClick={() => setPage(n.id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${page === n.id || (n.id === "clients" && page === "client-form") ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{n.label}</button>)}
            </div>
          </nav>}

          <main className={`mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 ${page === "preview" ? "print-area" : ""}`}>
            {page === "dashboard" && <>
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-sm font-medium text-blue-800">{business.businessName || "Your business"}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Invoices</h1><p className="mt-1 text-sm text-slate-500">{invoices.length} total · {filteredInvoices.length} matching</p></div>
                <button className={primary} onClick={openNewInvoice}>＋ New invoice</button>
              </div>
              {dataError && <div className="mb-4 flex items-center justify-between gap-3">{alert(dataError)}<button className={secondary} onClick={loadData}>Retry</button></div>}
              <section className={`${panel} p-4 sm:p-5`}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <label className="relative flex-1"><span className="sr-only">Search invoices</span><input className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice number or client…" /></label>
                  <label className="sm:w-44"><span className="sr-only">Filter by status</span><select className={inputClass} value={prefs.filter} onChange={e => changePrefs({ filter: e.target.value })}><option value="all">All statuses</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option></select></label>
                </div>
                {dataLoading ? <div className="space-y-3" aria-label="Loading invoices">{[1,2,3].map(x => <div key={x} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div> :
                invoices.length === 0 ? <div className="py-12 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-xl text-blue-700">▤</div><h2 className="font-semibold text-slate-900">No invoices yet</h2><p className="mt-1 text-sm text-slate-500">Create your first invoice to get started.</p><button className={`${primary} mt-4`} onClick={openNewInvoice}>Create your first invoice</button></div> :
                filteredInvoices.length === 0 ? <div className="py-12 text-center"><h2 className="font-semibold text-slate-900">No invoices match</h2><p className="mt-1 text-sm text-slate-500">Try another search or clear your filters.</p><button className="mt-3 text-sm font-semibold text-blue-700 underline" onClick={() => { setSearch(""); changePrefs({ filter: "all" }); }}>Clear filters</button></div> :
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      {[["invoiceNumber","Invoice"],["client","Client"],["issueDate","Issued"],["dueDate","Due date"],["total","Total"],["status","Status"]].map(([k,l]) => <th key={k} className="px-3 py-3 font-semibold"><button className="hover:text-slate-900" onClick={() => sortBy(k)}>{l}{prefs.sort === k ? (prefs.direction === "asc" ? " ↑" : " ↓") : ""}</button></th>)}
                      <th className="px-3 py-3">Actions</th>
                    </tr></thead>
                    <tbody>{filteredInvoices.map(i => {
                      const c = clientById(i.clientId);
                      return <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-3 py-4"><button className="font-semibold text-blue-800 hover:underline" onClick={() => openPreview(i)}>{i.invoiceNumber}</button></td>
                        <td className="px-3 py-4"><p className="font-medium text-slate-900">{c?.name || "Unknown client"}</p><p className="text-xs text-slate-500">{c?.email || ""}</p></td>
                        <td className="px-3 py-4 text-slate-600">{i.issueDate}</td><td className="px-3 py-4 text-slate-600">{i.dueDate}</td>
                        <td className="px-3 py-4 font-semibold tabular-nums">{money(i.total, i.currencyCode)}</td>
                        <td className="px-3 py-4"><label className="sr-only" htmlFor={`status-${i.id}`}>Status for {i.invoiceNumber}</label><select id={`status-${i.id}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold capitalize" value={i.status || "draft"} onChange={e => updateStatus(i, e.target.value)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option></select></td>
                        <td className="px-3 py-4"><div className="flex gap-2"><button className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => openEditInvoice(i)}>Edit</button><button className="text-xs font-semibold text-slate-600 hover:underline" onClick={() => openPreview(i)}>View</button><button className="text-xs font-semibold text-red-700 hover:underline" onClick={() => deleteInvoice(i)}>Delete</button></div></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>}
              </section>
            </>}

            {page === "clients" && <>
              <div className="mb-6 flex items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Clients</h1><p className="mt-1 text-sm text-slate-500">Your private client directory.</p></div><button className={primary} onClick={() => openClient()}>＋ Add client</button></div>
              {dataError && <div className="mb-4 flex items-center gap-3">{alert(dataError)}<button className={secondary} onClick={loadData}>Retry</button></div>}
              <section className={`${panel} p-4 sm:p-5`}>
                {dataLoading ? <div className="space-y-3">{[1,2,3].map(x => <div key={x} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div> :
                  clients.length ? <div className="space-y-3">{[...clients].sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(clientTable)}</div> :
                  <div className="py-12 text-center"><h2 className="font-semibold text-slate-900">No clients yet</h2><p className="mt-1 text-sm text-slate-500">Add a client to create your first invoice.</p><button className={`${primary} mt-4`} onClick={() => openClient()}>Add client</button></div>}
              </section>
            </>}

            {page === "client-form" && <>
              <div className="mb-6"><button className="mb-4 text-sm font-semibold text-blue-700 hover:underline" onClick={() => setPage("clients")}>← Back to clients</button><h1 className="text-2xl font-bold text-slate-900">{editingClient ? "Edit client" : "Add client"}</h1></div>
              <form onSubmit={saveClient} className={`${panel} mx-auto max-w-2xl space-y-5 p-5 sm:p-7`} noValidate>
                {clientError && alert(clientError)}
                {field("Client name", <input className={inputClass} autoFocus value={clientForm.name} onChange={e => setClientForm(v=>({...v,name:e.target.value}))} placeholder="Jordan Lee" />)}
                {field("Email address", <input type="email" className={inputClass} value={clientForm.email} onChange={e => setClientForm(v=>({...v,email:e.target.value}))} placeholder="jordan@example.com" />)}
                {field("Business name (optional)", <input className={inputClass} value={clientForm.businessName} onChange={e => setClientForm(v=>({...v,businessName:e.target.value}))} />)}
                {field("Phone (optional)", <input className={inputClass} type="tel" value={clientForm.phone} onChange={e => setClientForm(v=>({...v,phone:e.target.value}))} />)}
                {field("Billing address (optional)", <textarea className={inputClass} value={clientForm.billingAddress} onChange={e => setClientForm(v=>({...v,billingAddress:e.target.value}))} />)}
                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><button type="button" className={secondary} onClick={() => setPage("clients")}>Cancel</button><button disabled={clientBusy} className={primary}>{clientBusy ? "Saving…" : editingClient ? "Save client" : "Add client"}</button></div>
              </form>
            </>}

            {page === "profile" && <>
              <div className="mb-6"><h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Business profile</h1><p className="mt-1 text-sm text-slate-500">These details appear on your invoice previews.</p></div>
              {dataError && <div className="mx-auto mb-4 max-w-2xl">{alert(dataError)}</div>}
              <form onSubmit={saveBusiness} className={`${panel} mx-auto max-w-2xl space-y-5 p-5 sm:p-7`} noValidate>
                {dataLoading ? <div className="space-y-4">{[1,2,3,4].map(x=><div key={x} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div> : <>
                  {field("Business name", <input className={inputClass} value={business.businessName} onChange={e=>setBusiness(v=>({...v,businessName:e.target.value}))} placeholder="Northstar Studio" />)}
                  {field("Business email", <input type="email" className={inputClass} value={business.email} onChange={e=>setBusiness(v=>({...v,email:e.target.value}))} placeholder="hello@business.com" />)}
                  {field("Phone (optional)", <input type="tel" className={inputClass} value={business.phone || ""} onChange={e=>setBusiness(v=>({...v,phone:e.target.value}))} />)}
                  {field("Business address (optional)", <textarea className={inputClass} value={business.address || ""} onChange={e=>setBusiness(v=>({...v,address:e.target.value}))} />)}
                  {field("Tax or registration number (optional)", <input className={inputClass} value={business.taxOrRegistrationNumber || ""} onChange={e=>setBusiness(v=>({...v,taxOrRegistrationNumber:e.target.value}))} />)}
                  <div className="flex justify-end"><button className={primary} disabled={dataLoading}>{dataLoading ? "Saving…" : "Save business details"}</button></div>
                </>}
              </form>
            </>}

            {page === "editor" && invoiceDraft && <>
              <div className="mb-6 flex items-start justify-between gap-3"><div><button className="mb-3 text-sm font-semibold text-blue-700 hover:underline" onClick={() => setPage("dashboard")}>← Back to invoices</button><h1 className="text-2xl font-bold text-slate-900">{editingInvoiceId ? "Edit invoice" : "New invoice"}</h1></div>{badge(invoiceDraft.status)}</div>
              {invoiceError && <div className="mb-4">{alert(invoiceError)}</div>}
              {clients.length === 0 ? <section className={`${panel} p-8 text-center`}><h2 className="font-semibold">Add a client before creating an invoice</h2><button className={`${primary} mt-4`} onClick={() => openClient()}>Add client</button></section> :
              <form onSubmit={saveInvoice} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]" noValidate>
                <section className={`${panel} space-y-6 p-5 sm:p-7`}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {field("Client", <select className={inputClass} value={invoiceDraft.clientId} onChange={e=>updateDraft("clientId",e.target.value)}><option value="">Choose a client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}</select>)}
                    {field("Invoice number", <input className={inputClass} value={invoiceDraft.invoiceNumber} onChange={e=>updateDraft("invoiceNumber",e.target.value)} placeholder="INV-1001" />)}
                    {field("Issue date", <input type="date" className={inputClass} value={invoiceDraft.issueDate} onChange={e=>updateDraft("issueDate",e.target.value)} />)}
                    {field("Due date", <input type="date" className={inputClass} value={invoiceDraft.dueDate} onChange={e=>updateDraft("dueDate",e.target.value)} />)}
                    {field("Currency", <select className={inputClass} value={invoiceDraft.currencyCode} onChange={e=>{updateDraft("currencyCode",e.target.value); changePrefs({currency:e.target.value});}}>{["USD","CAD","AUD","GBP","EUR","NZD","INR","JPY"].map(c=><option key={c}>{c}</option>)}</select>)}
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-slate-900">Line items</h2><button type="button" className="text-sm font-semibold text-blue-700 hover:underline" onClick={()=>updateDraft("lineItems", [...invoiceDraft.lineItems, blankLine()])}>＋ Add line</button></div>
                    <div className="space-y-3">
                      {invoiceDraft.lineItems.map((line, index)=><div key={line.id} className="rounded-xl border border-slate-200 p-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_130px_auto] sm:items-end">
                          {field(index === 0 ? "Description" : `Description ${index+1}`, <input className={inputClass} value={line.description} onChange={e=>updateLine(line.id,"description",e.target.value)} placeholder="Services provided" />)}
                          {field("Quantity", <input className={inputClass} type="number" min="0.01" step="any" value={line.quantity} onChange={e=>updateLine(line.id,"quantity",e.target.value)} />)}
                          {field("Unit price", <input className={inputClass} type="number" min="0" step="0.01" value={line.unitPrice} onChange={e=>updateLine(line.id,"unitPrice",e.target.value)} />)}
                          <button type="button" className={`${danger} !px-3`} aria-label={`Remove line item ${index+1}`} disabled={invoiceDraft.lineItems.length === 1} onClick={()=>updateDraft("lineItems",invoiceDraft.lineItems.filter(l=>l.id!==line.id))}>Remove</button>
                        </div>
                        <p className="mt-2 text-right text-sm text-slate-500">Amount <strong className="ml-2 tabular-nums text-slate-800">{money((Number(line.quantity)||0)*(Number(line.unitPrice)||0), invoiceDraft.currencyCode)}</strong></p>
                      </div>)}
                    </div>
                  </div>
                </section>
                <aside className={`${panel} h-fit space-y-5 p-5`}>
                  {field("Status", <select className={inputClass} value={invoiceDraft.status} onChange={e=>updateDraft("status",e.target.value)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option></select>)}
                  {field("Tax rate (%)", <input className={inputClass} type="number" min="0" max="100" step="0.01" value={invoiceDraft.taxRate} onChange={e=>updateDraft("taxRate",e.target.value)} placeholder="0" />)}
                  {field("Notes (optional)", <textarea className={inputClass} value={invoiceDraft.notes} onChange={e=>updateDraft("notes",e.target.value)} placeholder="Payment terms or a thank-you…" />)}
                  <div className="space-y-2 border-t border-slate-200 pt-4 text-sm">
                    <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="tabular-nums">{money(totals.subtotal,invoiceDraft.currencyCode)}</span></div>
                    <div className="flex justify-between text-slate-600"><span>Tax{invoiceDraft.taxRate ? ` (${invoiceDraft.taxRate}%)` : ""}</span><span className="tabular-nums">{money(totals.taxAmount,invoiceDraft.currencyCode)}</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900"><span>Total</span><span className="tabular-nums">{money(totals.total,invoiceDraft.currencyCode)}</span></div>
                  </div>
                  <button className={`${primary} w-full`} disabled={invoiceBusy}>{invoiceBusy ? "Saving invoice…" : editingInvoiceId ? "Save changes" : "Save invoice"}</button>
                  <button type="button" className={`${secondary} w-full`} onClick={()=>setPage("dashboard")}>Cancel</button>
                </aside>
              </form>}
            </>}

            {page === "preview" && <>
              {!viewInvoice ? <section className={`${panel} mx-auto max-w-3xl p-8 text-center`}>{alert("This invoice could not be loaded.")}<button className={`${secondary} mt-4`} onClick={()=>setPage("dashboard")}>Return to invoices</button><button className="ml-2 text-sm text-blue-700 underline" onClick={loadData}>Retry</button></section> : <>
                <div className="no-print mx-auto mb-5 flex max-w-4xl flex-wrap items-center justify-between gap-3">
                  <button className={secondary} onClick={()=>setPage("dashboard")}>← Invoices</button>
                  <div className="flex flex-wrap gap-2">{viewInvoice.status === "draft" && <button className={secondary} onClick={()=>openEditInvoice(viewInvoice)}>Return to edit</button>}<button className={primary} onClick={()=>window.print()}>Print / Save as PDF</button></div>
                </div>
                <article className="paper mx-auto max-w-4xl rounded-sm border border-slate-200 bg-white p-6 sm:p-12">
                  <div className="flex flex-col justify-between gap-8 border-b border-slate-200 pb-8 sm:flex-row">
                    <div><h1 className="text-2xl font-bold text-slate-900">{business.businessName || "Your business"}</h1><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{business.address}</p><p className="text-sm text-slate-600">{business.email}{business.phone ? ` · ${business.phone}` : ""}</p>{business.taxOrRegistrationNumber && <p className="mt-1 text-xs text-slate-500">Tax / Reg: {business.taxOrRegistrationNumber}</p>}</div>
                    <div className="sm:text-right"><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-800">Invoice</p><p className="mt-2 text-2xl font-bold text-slate-900">{viewInvoice.invoiceNumber}</p><div className="mt-2">{badge(viewInvoice.status)}</div></div>
                  </div>
                  <div className="grid gap-6 py-8 sm:grid-cols-2">
                    <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Bill to</p><p className="font-semibold text-slate-900">{clientById(viewInvoice.clientId)?.name || "Client"}</p><p className="text-sm text-slate-600">{clientById(viewInvoice.clientId)?.businessName || ""}</p><p className="text-sm text-slate-600">{clientById(viewInvoice.clientId)?.email || ""}</p><p className="whitespace-pre-line text-sm text-slate-600">{clientById(viewInvoice.clientId)?.billingAddress || ""}</p></div>
                    <div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Issue date</p><p className="mt-2 font-medium">{viewInvoice.issueDate}</p></div><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Due date</p><p className="mt-2 font-medium">{viewInvoice.dueDate}</p></div></div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead><tr className="border-y border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500"><th className="px-3 py-3">Description</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">Amount</th></tr></thead>
                      <tbody>{(viewInvoice.lineItems||[]).map((l,i)=><tr key={l.id||i} className="border-b border-slate-100"><td className="px-3 py-4 font-medium">{l.description}</td><td className="px-3 py-4 text-right tabular-nums">{l.quantity}</td><td className="px-3 py-4 text-right tabular-nums">{money(l.unitPrice,viewInvoice.currencyCode)}</td><td className="px-3 py-4 text-right tabular-nums">{money(l.amount ?? l.quantity*l.unitPrice,viewInvoice.currencyCode)}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <div className="ml-auto mt-6 max-w-xs space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span className="tabular-nums">{money(viewInvoice.subtotal,viewInvoice.currencyCode)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">Tax{viewInvoice.taxRate ? ` (${viewInvoice.taxRate}%)` : ""}</span><span className="tabular-nums">{money(viewInvoice.taxAmount,viewInvoice.currencyCode)}</span></div>
                    <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold"><span>Total</span><span className="tabular-nums">{money(viewInvoice.total,viewInvoice.currencyCode)}</span></div>
                  </div>
                  {viewInvoice.notes && <div className="mt-10 border-t border-slate-200 pt-5"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Notes</p><p className="whitespace-pre-line text-sm leading-6 text-slate-700">{viewInvoice.notes}</p></div>}
                  <div className="mt-12 border-t border-slate-100 pt-5 text-center text-xs text-slate-400">Thank you for your business.</div>
                </article>
              </>}
            </>}

            {page === "admin" && user.isOwner && <>
              <div className="mb-6"><h1 className="text-2xl font-bold text-slate-900">Account admin</h1><p className="mt-1 text-sm text-slate-500">Manage account access and password reset requests.</p></div>
              {adminError && <div className="mb-4">{alert(adminError)}<button className="ml-3 text-sm font-semibold text-blue-700 underline" onClick={loadAdmin}>Retry</button></div>}
              <div className="space-y-5">
                <section className={`${panel} p-5`}><h2 className="mb-4 font-semibold">Accounts</h2>{!adminUsers.length ? <p className="text-sm text-slate-500">No accounts available.</p> : <div className="space-y-2">{adminUsers.map((u,i)=><div key={u.id||u.email||i} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{u.name || "Account holder"}</span><span className="text-slate-600">{u.email}</span></div>)}</div>}</section>
                <section className={`${panel} p-5`}>
                  <h2 className="font-semibold">Password reset requests</h2>
                  {!adminRequests.length ? <p className="mt-2 text-sm text-slate-500">No pending requests.</p> : <div className="mt-3 space-y-2">{adminRequests.map((r,i)=><button key={r.id||r.email||i} className="block w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-sm font-medium text-amber-900 hover:bg-amber-100" onClick={()=>setResetForm(f=>({...f,email:r.email||""}))}>{r.email || r}</button>)}</div>}
                  <form onSubmit={resetPassword} className="mt-5 grid gap-3 sm:grid-cols-2" noValidate>
                    <label className="block space-y-1"><span className="text-sm font-medium">Account email</span><input className={inputClass} type="email" value={resetForm.email} onChange={e=>setResetForm(f=>({...f,email:e.target.value}))} /></label>
                    <label className="block space-y-1"><span className="text-sm font-medium">New password</span><input className={inputClass} type="password" value={resetForm.password} onChange={e=>setResetForm(f=>({...f,password:e.target.value}))} /></label>
                    <div className="sm:col-span-2">{adminMessage && alert(adminMessage,"success")}{adminError && alert(adminError)}</div>
                    <div className="sm:col-span-2"><button className={primary}>Reset password</button></div>
                  </form>
                </section>
              </div>
            </>}
          </main>

          {dialog && <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!dialogBusy){setDialog(null);setDialogError("");}}}>
            <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 id="dialog-title" className="text-lg font-bold text-slate-900">{dialog.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{dialog.message}</p>
              {dialogError && <div className="mt-4">{alert(dialogError)}</div>}
              <div className="mt-6 flex justify-end gap-3">
                {dialog.kind !== "info" && <button className={secondary} disabled={dialogBusy} onClick={()=>{setDialog(null);setDialogError("");}}>Cancel</button>}
                <button className={dialog.kind === "client" || dialog.kind === "invoice" ? danger : primary} disabled={dialogBusy} onClick={confirmDialog}>{dialogBusy ? "Working…" : dialog.kind === "invoice" || dialog.kind === "client" ? "Delete" : dialog.kind === "add-client" ? "Add client" : "OK"}</button>
              </div>
            </section>
          </div>}
        </div>
      );
    }

export default App;
