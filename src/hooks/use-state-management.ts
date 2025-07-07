import { useCallback, useState } from "react";

// Toggle state hook with optional callbacks
export function useToggle(
  initialValue = false,
  options: {
    onToggle?: (newValue: boolean) => void;
    onToggleOn?: () => void;
    onToggleOff?: () => void;
  } = {}
) {
  const { onToggle, onToggleOn, onToggleOff } = options;
  const [value, setValue] = useState(initialValue);

  const toggle = () => {
    setValue(prev => {
      const newValue = !prev;
      onToggle?.(newValue);
      if (newValue) {
        onToggleOn?.();
      } else {
        onToggleOff?.();
      }
      return newValue;
    });
  };

  const setTrue = () => {
    setValue(true);
    onToggle?.(true);
    onToggleOn?.();
  };

  const setFalse = () => {
    setValue(false);
    onToggle?.(false);
    onToggleOff?.();
  };

  return {
    value,
    toggle,
    setTrue,
    setFalse,
    setValue,
  };
}

// Counter state hook with boundaries
export function useCounter(
  initialValue = 0,
  options: {
    min?: number;
    max?: number;
    step?: number;
    onIncrement?: (newValue: number) => void;
    onDecrement?: (newValue: number) => void;
    onChange?: (newValue: number) => void;
  } = {}
) {
  const { min, max, step = 1, onIncrement, onDecrement, onChange } = options;
  const [count, setCount] = useState(initialValue);

  const increment = () => {
    setCount(prev => {
      const newValue =
        max !== undefined ? Math.min(prev + step, max) : prev + step;
      if (newValue !== prev) {
        onIncrement?.(newValue);
        onChange?.(newValue);
      }
      return newValue;
    });
  };

  const decrement = () => {
    setCount(prev => {
      const newValue =
        min !== undefined ? Math.max(prev - step, min) : prev - step;
      if (newValue !== prev) {
        onDecrement?.(newValue);
        onChange?.(newValue);
      }
      return newValue;
    });
  };

  const reset = () => {
    setCount(initialValue);
    onChange?.(initialValue);
  };

  const set = useCallback(
    (value: number) => {
      const clampedValue = Math.max(
        min ?? Number.MIN_SAFE_INTEGER,
        Math.min(max ?? Number.MAX_SAFE_INTEGER, value)
      );
      setCount(clampedValue);
      onChange?.(clampedValue);
    },
    [min, max, onChange]
  );

  return {
    count,
    increment,
    decrement,
    reset,
    set,
    canIncrement: max === undefined || count < max,
    canDecrement: min === undefined || count > min,
  };
}

// Set state hook for managing collections
export function useSet<T>(initialValues: T[] = []) {
  const [set, setSet] = useState<Set<T>>(new Set(initialValues));

  const add = (value: T) => {
    setSet(prev => new Set([...prev, value]));
  };

  const remove = (value: T) => {
    setSet(prev => {
      const newSet = new Set(prev);
      newSet.delete(value);
      return newSet;
    });
  };

  const toggle = (value: T) => {
    setSet(prev => {
      const newSet = new Set(prev);
      if (newSet.has(value)) {
        newSet.delete(value);
      } else {
        newSet.add(value);
      }
      return newSet;
    });
  };

  const clear = () => {
    setSet(new Set());
  };

  const has = (value: T) => {
    return set.has(value);
  };

  const reset = () => {
    setSet(new Set(initialValues));
  };

  return {
    set,
    values: Array.from(set),
    size: set.size,
    add,
    remove,
    toggle,
    clear,
    has,
    reset,
    isEmpty: set.size === 0,
  };
}

// Map state hook for key-value management
export function useMap<K, V>(initialEntries: [K, V][] = []) {
  const [map, setMap] = useState<Map<K, V>>(new Map(initialEntries));

  const set = (key: K, value: V) => {
    setMap(prev => new Map([...prev, [key, value]]));
  };

  const get = (key: K) => {
    return map.get(key);
  };

  const remove = (key: K) => {
    setMap(prev => {
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
  };

  const clear = () => {
    setMap(new Map());
  };

  const has = (key: K) => {
    return map.has(key);
  };

  const reset = () => {
    setMap(new Map(initialEntries));
  };

  return {
    map,
    entries: Array.from(map.entries()),
    keys: Array.from(map.keys()),
    values: Array.from(map.values()),
    size: map.size,
    set,
    get,
    remove,
    clear,
    has,
    reset,
    isEmpty: map.size === 0,
  };
}

// Previous/current value comparison hook
export function usePrevious<T>(value: T) {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState<T | undefined>(undefined);

  if (value !== current) {
    setPrevious(current);
    setCurrent(value);
  }

  return previous;
}

// Controlled/uncontrolled state hook
export function useControllableState<T>(
  prop: T | undefined,
  defaultProp: T,
  onChange?: (value: T) => void
) {
  const [uncontrolledProp, setUncontrolledProp] = useState(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledProp;

  const setValue = useCallback(
    (nextValue: T | ((prevValue: T) => T)) => {
      if (typeof nextValue === "function") {
        const setter = nextValue as (prevValue: T) => T;
        const computedValue = setter(value);

        if (!isControlled) {
          setUncontrolledProp(computedValue);
        }
        onChange?.(computedValue);
      } else {
        if (!isControlled) {
          setUncontrolledProp(nextValue);
        }
        onChange?.(nextValue);
      }
    },
    [isControlled, value, onChange]
  );

  return [value, setValue] as const;
}
