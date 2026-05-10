declare module "qrcode" {
  export type QRCodeErrorCorrectionLevel = "L" | "M" | "Q" | "H";

  export type QRCodeRenderOptions = {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  export type QRCodeStringOptions = QRCodeRenderOptions & {
    type?: "svg" | "utf8" | "terminal";
  };

  const QRCode: {
    toCanvas(
      canvas: HTMLCanvasElement,
      text: string,
      options?: QRCodeRenderOptions,
    ): Promise<void>;
    toString(text: string, options?: QRCodeStringOptions): Promise<string>;
  };

  export default QRCode;
}
