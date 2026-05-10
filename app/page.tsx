"use client";

import {
  Download,
  ImagePlus,
  Mail,
  Palette,
  Phone,
  QrCode,
  RotateCcw,
  Smartphone,
  Type,
  Wifi,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

type QrKind = "url" | "text" | "email" | "phone" | "sms" | "wifi" | "vcard";
type ErrorLevel = "L" | "M" | "Q" | "H";

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

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const payload = useMemo(() => buildPayload(kind, form), [kind, form]);

  useEffect(() => {
    let cancelled = false;

    async function renderQr() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      await QRCode.toCanvas(canvas, payload, {
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
  }, [accent, background, errorLevel, foreground, logo, logoScale, margin, payload, size]);

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

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "custom-qr-code.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function downloadSvg() {
    const svg = await QRCode.toString(payload, {
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
    <main className="min-h-screen bg-[#f4f1ea] text-[#111827]">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-8 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-8">
        <section className="flex flex-col gap-5">
          <header className="flex flex-col gap-4 border-b border-[#d9d4c8] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8a4f2d]">
                QR Studio
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-normal text-[#111827] sm:text-5xl">
                Custom QR generator
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetDesign}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-[#c8c1b4] bg-white px-4 text-sm font-semibold text-[#111827] shadow-sm transition hover:bg-[#faf9f6]"
              >
                <RotateCcw size={17} />
                Reset
              </button>
              <button
                type="button"
                onClick={downloadPng}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-[#111827] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#263246]"
              >
                <Download size={17} />
                PNG
              </button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {qrKinds.map((item) => {
              const Icon = item.icon;
              const active = kind === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKind(item.id)}
                  className={`flex h-16 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition ${
                    active
                      ? "border-[#111827] bg-[#111827] text-white shadow-sm"
                      : "border-[#d9d4c8] bg-white text-[#374151] hover:border-[#a8a092]"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
            <section className="rounded-md border border-[#d9d4c8] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <QrCode size={20} />
                <h2 className="text-lg font-semibold">Content</h2>
              </div>
              <div className="grid gap-4">
                {kind === "url" && (
                  <Field label="URL" value={form.url} onChange={(value) => updateField("url", value)} />
                )}
                {kind === "text" && (
                  <label className="grid gap-2 text-sm font-semibold text-[#374151]">
                    Text
                    <textarea
                      value={form.text}
                      onChange={(event) => updateField("text", event.target.value)}
                      rows={8}
                      className="min-h-48 resize-y rounded-md border border-[#cfc8ba] px-3 py-3 text-base font-normal outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#f2c94c]"
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
                    <label className="grid gap-2 text-sm font-semibold text-[#374151]">
                      Security
                      <select
                        value={form.encryption}
                        onChange={(event) => updateField("encryption", event.target.value)}
                        className="h-11 rounded-md border border-[#cfc8ba] bg-white px-3 text-base font-normal outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#f2c94c]"
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

            <section className="rounded-md border border-[#d9d4c8] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
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
                      className="flex h-12 items-center gap-3 rounded-md border border-[#d9d4c8] bg-white px-3 text-sm font-semibold transition hover:border-[#111827]"
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
                <label className="grid gap-2 text-sm font-semibold text-[#374151]">
                  Correction
                  <select
                    value={errorLevel}
                    onChange={(event) => setErrorLevel(event.target.value as ErrorLevel)}
                    className="h-11 rounded-md border border-[#cfc8ba] bg-white px-3 text-base font-normal outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#f2c94c]"
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
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#c8c1b4] bg-white px-4 text-sm font-semibold text-[#111827] shadow-sm transition hover:bg-[#faf9f6]"
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

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-md border border-[#d9d4c8] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Preview</h2>
                <p className="mt-1 text-sm text-[#6b7280]">{payload.length} characters</p>
              </div>
              <button
                type="button"
                onClick={downloadSvg}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#c8c1b4] bg-white px-3 text-sm font-semibold text-[#111827] shadow-sm transition hover:bg-[#faf9f6]"
              >
                <Download size={16} />
                SVG
              </button>
            </div>
            <div
              className="grid aspect-square w-full max-w-full place-items-center overflow-hidden rounded-md border p-5"
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
            <div className="mt-4 rounded-md border border-[#e6e0d5] bg-[#faf9f6] p-3">
              <p className="line-clamp-4 break-all font-mono text-xs leading-5 text-[#4b5563]">
                {payload}
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
    <label className="grid gap-2 text-sm font-semibold text-[#374151]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md border border-[#cfc8ba] px-3 text-base font-normal outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#f2c94c]"
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
    <label className="grid gap-2 text-sm font-semibold text-[#374151]">
      {label}
      <span className="flex h-11 items-center gap-2 rounded-md border border-[#cfc8ba] bg-white px-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-7 w-8 cursor-pointer border-0 bg-transparent p-0"
        />
        <span className="truncate font-mono text-xs font-normal text-[#4b5563]">{value}</span>
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
    <label className="grid gap-2 text-sm font-semibold text-[#374151]">
      <span className="flex items-center justify-between">
        {label}
        <span className="font-mono text-xs font-normal text-[#4b5563]">
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
        className="accent-[#111827]"
      />
    </label>
  );
}
