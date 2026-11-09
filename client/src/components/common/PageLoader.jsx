import CameraLoader from './CameraLoader';

/**
 * The loading screen of a whole page (the 3D camera, the word "Loading" and a thin progress line), centred in the space under the navbar.
 * <PageLoader />   (the small inline spinners in buttons / sections keep using <Loader />)
 */
export default function PageLoader({ label = 'Loading' }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <div className="page-loader__inner">
        <CameraLoader />
        <span className="loader__label">{label}</span>
        <span className="page-loader__bar" aria-hidden="true" />
      </div>
    </div>
  );
}
