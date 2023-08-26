import { useEffect, useRef, useState } from 'react';

export function useOptHeld(): boolean {
    const [optHeld, setOptHeld] = useState(false);

    const setOptHeldRef = useRef(setOptHeld);
    setOptHeldRef.current = setOptHeld;
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            setOptHeldRef.current(e.altKey);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            setOptHeldRef.current(e.altKey);
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    return optHeld;
}
