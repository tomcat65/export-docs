declare module 'pdf-parse' {
  interface PDFParseResult {
    text: string;
    numpages: number;
    info: any;
    metadata: any;
    version: string;
  }

  function parse(dataBuffer: Buffer, options?: any): Promise<PDFParseResult>;
  
  export = parse;
} 