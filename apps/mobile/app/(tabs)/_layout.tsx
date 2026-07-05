import React from "react";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import Svg, { Circle, Path } from "react-native-svg";
import { isIOS, palette, iosBlur } from "../../constants/theme";

function Icon({ name, focused }: { name: "chat" | "call" | "search"; focused: boolean }) {
  const color = focused ? palette.white : palette.textSecondary;
  const strokeWidth = focused ? 2.4 : 2;
  return (
    <View style={styles.iconWrap}>
      <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
        {name === "chat" && (
          <Path
            d="M4 6.8C4 5.25 5.25 4 6.8 4h10.4C18.75 4 20 5.25 20 6.8v6.4c0 1.55-1.25 2.8-2.8 2.8H9.3L5 20v-4.25A2.78 2.78 0 0 1 4 13.6V6.8Z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {name === "call" && (
          <Path
            d="M7.2 4.8 9.1 8c.35.6.25 1.35-.25 1.85l-1.1 1.1a12.2 12.2 0 0 0 5.3 5.3l1.1-1.1c.5-.5 1.25-.6 1.85-.25l3.2 1.9c.65.38.95 1.16.72 1.88-.35 1.1-1.38 1.82-2.53 1.72C9.9 19.82 4.18 14.1 3.6 6.7c-.1-1.15.62-2.18 1.72-2.53.72-.23 1.5.07 1.88.63Z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {name === "search" && (
          <>
            <Circle cx="10.5" cy="10.5" r="5.5" stroke={color} strokeWidth={strokeWidth} />
            <Path d="M15 15 20 20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          </>
        )}
      </Svg>
      {focused && <View style={styles.dot} />}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: palette.white,
        tabBarInactiveTintColor: palette.textSecondary,
        tabBarStyle: {
          backgroundColor: isIOS ? "transparent" : palette.androidBackground,
          borderTopWidth: isIOS ? StyleSheet.hairlineWidth : 0,
          borderTopColor: palette.glassBorder,
          position: isIOS ? "absolute" : "relative",
          elevation: 0,
          height: isIOS ? 74 : 64,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          alignItems: "center",
          justifyContent: "center",
        },
        tabBarBackground: isIOS
          ? () => (
              <BlurView
                intensity={iosBlur.intensity}
                tint={iosBlur.tint}
                style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.2)" }]}
              />
            )
          : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Чаты",
          tabBarIcon: ({ focused }) => <Icon name="chat" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: "Звонки",
          tabBarIcon: ({ focused }) => <Icon name="call" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search-tab"
        options={{
          title: "Поиск",
          tabBarIcon: ({ focused }) => <Icon name="search" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 56,
  },
  dot: {
    backgroundColor: palette.white,
    borderRadius: 2,
    height: 4,
    marginTop: 4,
    width: 4,
  },
});
