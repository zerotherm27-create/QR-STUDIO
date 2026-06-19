"use client";

import {
  CheckCircle2,
  Download,
  ImagePlus,
  Link2,
  Loader2,
  Mail,
  Palette,
  Phone,
  QrCode,
  RotateCcw,
  Save,
  Smartphone,
  Type,
  Wifi,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

type QrKind = "url" | "text" | "email" | "phone" | "sms" | "wifi" | "vcard";
type ErrorLevel = "L" | "M" | "Q" | "H";

type SavedQr = {
  createdAt: string;
  destinationUrl: string;
  ownerId: string | null;
  scanCount: number;
  shortUrl: string;
  slug: string;
  status: "active" | "disabled";
  title: string | null;
  updatedAt: string;
};

const qrKinds: Array<{ id: QrKind; label: string; icon: typeof Type }> = [
  { id: "url", label: "URL", icon: QrCode },
  { id: "text", label: "Text", icon: Type },
  { id: "email", label: "Email", icon: Mail },
  { id: "phone", label: "Phone", icon: Phone },
  { id: "sms", label: "SMS", icon: Smartphone },
  { id: "wifi", label: "Wi-Fi", icon: Wifi },
  { id: "vcard", label: "vCard", icon: ImagePlus },
];

const colorPresets = [
  { name: "Ink", fg: "#101820", bg: "#ffffff", accent: "#f2c94c" },
  { name: "Aqua", fg: "#023047", bg: "#f7fbff", accent: "#00b4d8" },
  { name: "Berry", fg: "#5f0f40", bg: "#fff7fb", accent: "#fb8b24" },
  { name: "Forest", fg: "#16302b", bg: "#fbfff8", accent: "#59a14f" },
];

const defaultForm = {
  url: "https://example.com",
  text: "Create something people can scan.",
  email: "hello@example.com",
  subject: "Hello",
  body: "I scanned your QR code.",
  phone: "+15551234567",
  sms: "+15551234567",
  smsMessage: "Hi there",
  ssid: "Studio WiFi",
  password: "makeitbeautiful",
  encryption: "WPA",
  firstName: "Jo",
  lastName: "Rivera",
  organization: "QR Studio",
  title: "Creative Lead",
  website: "https://example.com",
};

function escapeWifi(value: string) {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function buildPayload(kind: QrKind, form: typeof defaultForm) {
  switch (kind) {
    case "url":
      return form.url.trim() || "https://example.com";
    case "email":
      return `mailto:${form.email}?subject=${encodeURIComponent(
        form.subject,
      )}&body=${encodeURIComponent(form.body)}`;
    case "phone":
      return `tel:${form.phone}`;
    case "sms":
      return `sms:${form.sms}?body=${encodeURIComponent(form.smsMessage)}`;
    case "wifi":
      return `WIFI:T:${form.encryption};S:${escapeWifi(
        form.ssid,
      )};P:${escapeWifi(form.password)};;`;
    case "vcard":
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${form.lastName};${form.firstName};;;`,
        `FN:${form.firstName} ${form.lastName}`,
        `ORG:${form.organization}`,
        `TITLE:${form.title}`,
        `TEL:${form.phone}`,
        `EMAIL:${form.email}`,
        `URL:${form.website}`,
        "END:VCARD",
      ].join("\n");
    default:
      return form.text || "Create something people can scan.";
  }
}

function normalizeUrlInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return trimmed;
  }
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs = 8000,
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const result = (await response.json()) as T & { error?: string };

    if (!response.ok) {
      throw new Error(result.error ?? "Request failed.");
    }

    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Check the local server or database connection.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function QrGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dynamicQr, setDynamicQr] = useState<SavedQr | null>(null);
  const [kind, setKind] = useState<QrKind>("url");
  const [form, setForm] = useState(defaultForm);
  const [foreground, setForeground] = useState("#101820");
  const [background, setBackground] = useState("#ffffff");
  const [accent, setAccent] = useState("#f2c94c");
  const [margin, setMargin] = useState(2);
  const [size, setSize] = useState(720);
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>("H");
  const [logo, setLogo] = useState<string | null>(null);
  const [logoScale, setLogoScale] = useState(18);
  const [previewData, setPreviewData] = useState("");
  const [dynamicStatus, setDynamicStatus] = useState("");
  const [dynamicError, setDynamicError] = useState("");
  const [isSavingDynamic, setIsSavingDynamic] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const payload = useMemo(() => buildPayload(kind, form), [kind, form]);
  const activePayload =
    kind === "url" && dynamicQr ? dynamicQr.shortUrl : payload;
  const dynamicSelectionChanged =
    Boolean(dynamicQr) &&
    (normalizeUrlInput(form.url) !== dynamicQr?.destinationUrl ||
      linkTitle.trim() !== (dynamicQr?.title ?? ""));

  useEffect(() => {
    let cancelled = false;

    async function renderQr() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      await QRCode.toCanvas(canvas, activePayload, {
        width: size,
        margin,
        errorCorrectionLevel: errorLevel,
        color: {
          dark: foreground,
          light: background,
        },
      });

      if (cancelled) return;
      if (!logo) {
        setPreviewData(canvas.toDataURL("image/png"));
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) return;

      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        const logoSize = canvas.width * (logoScale / 100);
        const x = (canvas.width - logoSize) / 2;
        const y = (canvas.height - logoSize) / 2;
        const pad = logoSize * 0.18;

        context.fillStyle = background;
        context.beginPath();
        context.roundRect(x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2, 32);
        context.fill();
        context.drawImage(image, x, y, logoSize, logoSize);
        setPreviewData(canvas.toDataURL("image/png"));
      };
      image.src = logo;
    }

    renderQr();
    return () => {
      cancelled = true;
    };
  }, [activePayload, background, errorLevel, foreground, logo, logoScale, margin, size]);

  function updateField(name: keyof typeof defaultForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function saveDynamicLink() {
    setIsSavingDynamic(true);
    setDynamicError("");
    setDynamicStatus("");

    try {
      const result = await fetchJsonWithTimeout<SavedQr>("/api/qr", {
        body: JSON.stringify({
          destinationUrl: form.url,
          title: linkTitle,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      setDynamicQr(result);
      setForm((current) => ({ ...current, url: result.destinationUrl }));
      setLinkTitle(result.title ?? "");
      setDynamicStatus("Saved to My QR Codes.");
    } catch (error) {
      setDynamicError(error instanceof Error ? error.message : "Could not create dynamic link.");
    } finally {
      setIsSavingDynamic(false);
    }
  }

  async function updateDynamicLink() {
    if (!dynamicQr) return;

    setIsSavingDynamic(true);
    setDynamicError("");
    setDynamicStatus("");

    try {
      const result = await fetchJsonWithTimeout<SavedQr>(`/api/qr/${dynamicQr.slug}`, {
        body: JSON.stringify({
          destinationUrl: form.url,
          title: linkTitle,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      setDynamicQr(result);
      setForm((current) => ({ ...current, url: result.destinationUrl }));
      setLinkTitle(result.title ?? "");
      setDynamicStatus("Destination updated.");
    } catch (error) {
      setDynamicError(error instanceof Error ? error.message : "Could not update dynamic link.");
    } finally {
      setIsSavingDynamic(false);
    }
  }

  function clearDynamicLink() {
    setDynamicQr(null);
    setDynamicStatus("");
    setDynamicError("");
    setCopyStatus("");
  }

  async function copyDynamicLink() {
    if (!dynamicQr) return;
    await navigator.clipboard.writeText(dynamicQr.shortUrl);
    setCopyStatus("Copied.");
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "custom-qr-code.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function downloadSvg() {
    const svg = await QRCode.toString(activePayload, {
      type: "svg",
      margin,
      errorCorrectionLevel: errorLevel,
      color: {
        dark: foreground,
        light: background,
      },
    });
    const brandedSvg = logo
      ? svg.replace(
          "</svg>",
          `<rect x="40%" y="40%" width="20%" height="20%" rx="4%" fill="${background}"/><image href="${logo}" x="42%" y="42%" width="16%" height="16%" preserveAspectRatio="xMidYMid meet"/></svg>`,
        )
      : svg;
    const blob = new Blob([brandedSvg], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.download = "custom-qr-code.svg";
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function resetDesign() {
    setForeground("#101820");
    setBackground("#ffffff");
    setAccent("#f2c94c");
    setMargin(2);
    setSize(720);
    setErrorLevel("H");
    setLogo(null);
    setLogoScale(18);
  }

  return (
    <main className="app-shell">
      <div className="studio-grid">
        <section className="control-stack">
          <header className="studio-header">
            <div>
              <p className="studio-kicker">QR Studio</p>
              <h1 className="studio-title">
                Dynamic QR generator
              </h1>
              <p className="studio-subtitle">
                Build branded codes, publish editable short links, and keep scans measurable.
              </p>
            </div>
            <div className="header-actions">
              <button
                type="button"
                onClick={resetDesign}
                className="btn btn-secondary"
              >
                <RotateCcw size={17} />
                Reset
              </button>
              <button
                type="button"
                onClick={downloadPng}
                className="btn btn-primary"
              >
                <Download size={17} />
                PNG
              </button>
            </div>
          </header>

          <div className="qr-tabs" role="tablist" aria-label="QR content type">
            {qrKinds.map((item) => {
              const Icon = item.icon;
              const active = kind === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKind(item.id)}
                  className={`qr-tab ${active ? "qr-tab-active" : ""}`}
                  aria-pressed={active}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="editor-grid">
            <section className="panel panel-content">
              <div className="panel-title">
                <QrCode size={20} />
                <h2 className="text-lg font-semibold">Content</h2>
              </div>
              <div className="grid gap-4">
                {kind === "url" && (
                  <>
                    <Field label="Destination URL" value={form.url} onChange={(value) => updateField("url", value)} />
                    <Field label="Link title" value={linkTitle} onChange={setLinkTitle} />
                    <div className="dynamic-card">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="card-label">
                            Dynamic short link
                          </p>
                          <p className="payload-text mt-1">
                            {dynamicQr?.shortUrl ?? "Create one to make this QR editable after download or printing."}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {!dynamicQr && (
                            <button
                              type="button"
                              onClick={saveDynamicLink}
                              disabled={isSavingDynamic}
                              className="btn btn-primary btn-compact"
                            >
                              {isSavingDynamic ? <Loader2 className="animate-spin" size={16} /> : <Link2 size={16} />}
                              Create
                            </button>
                          )}
                          {dynamicQr && dynamicSelectionChanged && (
                            <button
                              type="button"
                              onClick={updateDynamicLink}
                              disabled={isSavingDynamic}
                              className="btn btn-primary btn-compact"
                            >
                              {isSavingDynamic ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                              Update
                            </button>
                          )}
                          {dynamicQr && (
                            <button
                              type="button"
                              onClick={copyDynamicLink}
                              className="btn btn-secondary btn-compact"
                            >
                              Copy link
                            </button>
                          )}
                          {dynamicQr && (
                            <button
                              type="button"
                              onClick={clearDynamicLink}
                              className="btn btn-secondary btn-compact"
                            >
                              Direct
                            </button>
                          )}
                        </div>
                      </div>
                      {dynamicQr && (
                        <>
                          <div className="status-grid">
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 size={14} />
                              QR points to the stable short link
                            </span>
                            <span>Scans recorded: {dynamicQr.scanCount}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold">
                            <a href={`/dashboard/qr/${dynamicQr.slug}`}>
                              Open dashboard item
                            </a>
                            <a href="/dashboard">View My QR Codes</a>
                            {copyStatus ? <span aria-live="polite">{copyStatus}</span> : null}
                          </div>
                        </>
                      )}
                      {dynamicStatus && (
                        <p className="status-message status-success" aria-live="polite">
                          {dynamicStatus}
                        </p>
                      )}
                      {dynamicError && (
                        <p className="status-message status-error" aria-live="polite">
                          {dynamicError}
                        </p>
                      )}
                    </div>
                  </>
                )}
                {kind === "text" && (
                  <label className="grid gap-2 text-sm font-semibold text-[#374151]">
                    Text
                    <textarea
                      value={form.text}
                      onChange={(event) => updateField("text", event.target.value)}
                      rows={8}
                      className="control-input min-h-48 resize-y py-3"
                    />
                  </label>
                )}
                {kind === "email" && (
                  <>
                    <Field label="Email" value={form.email} onChange={(value) => updateField("email", value)} />
                    <Field label="Subject" value={form.subject} onChange={(value) => updateField("subject", value)} />
                    <Field label="Body" value={form.body} onChange={(value) => updateField("body", value)} />
                  </>
                )}
                {kind === "phone" && (
                  <Field label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} />
                )}
                {kind === "sms" && (
                  <>
                    <Field label="Number" value={form.sms} onChange={(value) => updateField("sms", value)} />
                    <Field label="Message" value={form.smsMessage} onChange={(value) => updateField("smsMessage", value)} />
                  </>
                )}
                {kind === "wifi" && (
                  <>
                    <Field label="Network" value={form.ssid} onChange={(value) => updateField("ssid", value)} />
                    <Field label="Password" value={form.password} onChange={(value) => updateField("password", value)} />
                    <label className="field-label">
                      Security
                      <select
                        value={form.encryption}
                        onChange={(event) => updateField("encryption", event.target.value)}
                        className="control-input h-11"
                      >
                        <option value="WPA">WPA/WPA2</option>
                        <option value="WEP">WEP</option>
                        <option value="nopass">Open</option>
                      </select>
                    </label>
                  </>
                )}
                {kind === "vcard" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="First name" value={form.firstName} onChange={(value) => updateField("firstName", value)} />
                    <Field label="Last name" value={form.lastName} onChange={(value) => updateField("lastName", value)} />
                    <Field label="Organization" value={form.organization} onChange={(value) => updateField("organization", value)} />
                    <Field label="Title" value={form.title} onChange={(value) => updateField("title", value)} />
                    <Field label="Phone" value={form.phone} onChange={(value) => updateField("phone", value)} />
                    <Field label="Email" value={form.email} onChange={(value) => updateField("email", value)} />
                    <div className="sm:col-span-2">
                      <Field label="Website" value={form.website} onChange={(value) => updateField("website", value)} />
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="panel panel-design">
              <div className="panel-title">
                <Palette size={20} />
                <h2 className="text-lg font-semibold">Design</h2>
              </div>
              <div className="grid gap-5">
                <div className="grid grid-cols-2 gap-2">
                  {colorPresets.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setForeground(preset.fg);
                        setBackground(preset.bg);
                        setAccent(preset.accent);
                      }}
                      className="preset-button"
                    >
                      <span className="flex -space-x-1">
                        <span className="h-5 w-5 rounded-full border border-white" style={{ background: preset.fg }} />
                        <span className="h-5 w-5 rounded-full border border-white" style={{ background: preset.accent }} />
                      </span>
                      {preset.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <ColorField label="Code" value={foreground} onChange={setForeground} />
                  <ColorField label="Paper" value={background} onChange={setBackground} />
                  <ColorField label="Accent" value={accent} onChange={setAccent} />
                </div>
                <RangeField label="Size" value={size} min={420} max={1200} step={20} unit="px" onChange={setSize} />
                <RangeField label="Margin" value={margin} min={0} max={6} step={1} onChange={setMargin} />
                <label className="field-label">
                  Correction
                  <select
                    value={errorLevel}
                    onChange={(event) => setErrorLevel(event.target.value as ErrorLevel)}
                    className="control-input h-11"
                  >
                    <option value="L">Low</option>
                    <option value="M">Medium</option>
                    <option value="Q">Quartile</option>
                    <option value="H">High</option>
                  </select>
                </label>
                <div className="grid gap-3">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary justify-center"
                  >
                    <ImagePlus size={17} />
                    Logo
                  </button>
                  {logo && (
                    <RangeField label="Logo" value={logoScale} min={10} max={28} step={1} unit="%" onChange={setLogoScale} />
                  )}
                </div>
              </div>
            </section>
          </div>
        </section>

        <aside className="preview-rail">
          <section className="panel preview-panel">
            <div className="preview-header">
              <div>
                <h2 className="text-lg font-semibold">Preview</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{activePayload.length} characters</p>
              </div>
              <button
                type="button"
                onClick={downloadSvg}
                className="btn btn-secondary btn-compact"
              >
                <Download size={16} />
                SVG
              </button>
            </div>
            <div
              className="qr-preview-frame"
              style={{ borderColor: accent, background }}
            >
              {previewData && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewData}
                  alt="Generated QR code preview"
                  className="block h-full w-full object-contain"
                />
              )}
              <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
            </div>
            <div className="payload-box">
              <p className="line-clamp-4 payload-text">
                {activePayload}
              </p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-label">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="control-input h-11"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-label">
      {label}
      <span className="color-control">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
        />
        <span className="truncate font-mono text-xs font-normal text-[var(--muted)]">{value}</span>
      </span>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-label">
      <span className="flex items-center justify-between">
        {label}
        <span className="font-mono text-xs font-normal text-[var(--muted)]">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range-control"
      />
    </label>
  );
}
