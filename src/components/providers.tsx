"use client";
import {ThemeProvider} from "next-themes";
export function Providers({children}:{children:React.ReactNode}){
 return <ThemeProvider attribute="data-theme" defaultTheme="system" themes={["light","dark","sunshine"]} enableSystem>{children}</ThemeProvider>;
}
