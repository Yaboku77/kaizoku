declare module 'cheerio-without-node-native' {
  export type CheerioAPI = any;
  export type Cheerio<T> = any;
  
  export function load(html: string | any, options?: any): any;
  const cheerio: any;
  export default cheerio;
}

declare module 'domhandler' {
  export type AnyNode = any;
}
