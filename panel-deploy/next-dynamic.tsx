import React, {lazy, Suspense} from 'react';
// Browser-only equivalent for the single Next dynamic import used by the
// unified dashboard. This entry point never renders server-side.
export default function dynamic<T extends React.ComponentType<any>>(
  loader: () => Promise<{default:T}>, options?:{loading?:React.ComponentType;ssr?:boolean},
) {
  const Component=lazy(loader);const Loading=options?.loading;
  return (props:React.ComponentProps<T>) => <Suspense fallback={Loading ? <Loading/> : null}><Component {...props}/></Suspense>;
}
