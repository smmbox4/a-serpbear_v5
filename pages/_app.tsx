import '../styles/globals.css';
import React from 'react';
import type { AppProps, AppContext } from 'next/app';
import App from 'next/app';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';
import { Toaster } from 'react-hot-toast';
import { getBranding, type BrandingConfig } from '../utils/branding';
import { LanguageProvider } from '../i18n/LanguageContext';

type CustomAppProps = AppProps & {
   pageProps: {
      serverSideBranding?: BrandingConfig;
   };
};

function MyApp({ Component, pageProps }: CustomAppProps) {
   const [queryClient] = React.useState(() => new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
        },
      },
    }));
   return <QueryClientProvider client={queryClient}>
            <LanguageProvider>
              <Component {...pageProps} />
              <ReactQueryDevtools initialIsOpen={false} />
              <Toaster position="bottom-center" containerClassName="react_toaster" />
            </LanguageProvider>
          </QueryClientProvider>;
}

MyApp.getInitialProps = async (appContext: AppContext) => {
   const appProps = await App.getInitialProps(appContext);
   
   // Provide server-side branding for SSR
   const serverSideBranding = getBranding();
   
   return {
      ...appProps,
      pageProps: {
         ...appProps.pageProps,
         serverSideBranding,
      },
   };
};

export default MyApp;
