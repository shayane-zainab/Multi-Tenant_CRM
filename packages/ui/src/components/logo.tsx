import type * as React from "react";

const Logo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={512}
		height={512}
		viewBox="0 0 512 512"
		fill="none"
		{...props}
		aria-label="Aristral Logo"
	>
		<path
			d="M256 32L32 480H160L256 288L352 480H480L256 32Z"
			fill="currentColor"
		/>
		<path
			d="M192 320H320V400H192V320Z"
			fill="currentColor"
		/>
	</svg>
);
export default Logo;
