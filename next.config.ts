import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
const config: NextConfig = { poweredByHeader: false, serverExternalPackages: ["pdfjs-dist", "mammoth"] };
export default createNextIntlPlugin("./src/i18n/request.ts")(config);
