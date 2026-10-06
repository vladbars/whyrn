import React, { createContext, memo, useCallback, useContext, useEffect, useReducer, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WhyRN, withWhyRN, useRenderCount } from 'whyrn.dev';

// Drives state updates on timers so the overlay can be checked without tapping.
const SELF_TEST = false;

// 1. Re-renders because of its own state.
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!SELF_TEST) return;
    const id = setInterval(() => setCount((c) => c + 1), 1500);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Counter (own state)</Text>
      <Text>count: {count}</Text>
      <Button label="+1" onPress={() => setCount((c) => c + 1)} />
    </View>
  );
}

// 2. Re-renders because the parent passes a new object with the same value.
function UserCard({ user }: { user: { name: string } }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>UserCard (new ref, same value)</Text>
      <Text>{user.name}</Text>
    </View>
  );
}

// 3. Memoized: must NOT re-render when the parent re-renders.
const MemoBox = memo(function MemoBox({ label }: { label: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>MemoBox (memo, stable props)</Text>
      <Text>{label}</Text>
    </View>
  );
});

// 4. Root uses flex: 1 inside a fixed-height row — a wrapper View would collapse it.
function FlexChild({ color }: { color: string }) {
  return <View style={{ flex: 1, backgroundColor: color, borderRadius: 6 }} />;
}

// 5. useReducer
function ReducerBox() {
  const [n, inc] = useReducer((s: number) => s + 1, 0);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>ReducerBox (useReducer)</Text>
      <Text>n: {n}</Text>
      <Button label="dispatch" onPress={inc} />
    </View>
  );
}

// 7. Context consumer: the provider passes a new object with the same content every render.
const ThemeContext = createContext({ mode: 'light' });
ThemeContext.displayName = 'ThemeContext';

const ThemeLabel = memo(function ThemeLabel() {
  const theme = useContext(ThemeContext);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>ThemeLabel (context, same content)</Text>
      <Text>mode: {theme.mode}</Text>
    </View>
  );
});

// 6. Explicit HOC
function Tagged({ value }: { value: number }) {
  useRenderCount('Tagged');
  return (
    <View style={styles.card}>
      <Text style={styles.title}>withWhyRN(Tagged)</Text>
      <Text>value: {value}</Text>
    </View>
  );
}
const TrackedTagged = withWhyRN(Tagged);

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function Screen() {
  const [tick, setTick] = useState(0);
  const [auto, setAuto] = useState(SELF_TEST);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [auto]);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>WhyRN example · tick {tick}</Text>
      <View style={styles.row}>
        <Button label="re-render parent" onPress={bump} />
        <Button label={auto ? 'stop auto' : 'auto tick'} onPress={() => setAuto((a) => !a)} />
      </View>
      <Counter />
      <UserCard user={{ name: 'Alice' }} />
      <MemoBox label="static" />
      <View style={[styles.row, { height: 40 }]}>
        <FlexChild color="#93c5fd" />
        <FlexChild color="#fca5a5" />
      </View>
      <ReducerBox />
      <ThemeContext.Provider value={{ mode: 'light' }}>
        <ThemeLabel />
      </ThemeContext.Provider>
      <TrackedTagged value={tick} />
    </ScrollView>
  );
}

export default function App() {
  // State outside <WhyRN>: re-rendering this must not crash after hooks are patched.
  const [, setOuter] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setOuter(1), 3000);
    return () => clearTimeout(id);
  }, []);

  return (
    <WhyRN heatmap>
      <Screen />
      <StatusBar style="auto" />
    </WhyRN>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 64, gap: 12 },
  header: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  card: { padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6', gap: 4 },
  title: { fontWeight: '600' },
  button: { backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, alignSelf: 'flex-start' },
  buttonText: { color: '#fff' },
});
