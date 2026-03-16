import { Feather, FontAwesome5 } from "@expo/vector-icons";
import { AxiosError } from "axios";
import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputChangeEventData,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/src/core/auth/use-session";
import { useLocale } from "@/src/core/i18n/locale-provider";
import { getRowDirection, getTextAlign } from "@/src/core/i18n/rtl";
import { resolveFontFamily } from "@/src/core/theme/fonts";
import { useTheme } from "@/src/core/theme/theme-provider";

const palettes = {
  dark: {
    background: "#0f1419",
    card: "#151a21",
    cardBorder: "#2a2f3a",
    cardShadow: "#08111f",
    logo: "#ff6b00",
    title: "#f1ece4",
    subtitle: "#d0d9e7",
    label: "#93a9c5",
    input: "#293752",
    inputBorder: "#2f3f59",
    inputText: "#ffffff",
    placeholderText: "rgba(250, 250, 250, 0.42)",
    inputFocusBg: "rgba(255, 107, 0, 0.08)",
    inputFocusGlow: "rgba(255, 107, 0, 0.24)",
    toggleBg: "#162235",
    toggleBorder: "#2f3b4f",
    footer: "#87a0bf",
    buttonText: "#0d1420",
    errorBorder: "#7f1d1d",
    errorBg: "rgba(127, 29, 29, 0.22)",
    errorText: "#fecaca",
    blurOverlay: "rgba(15, 20, 25, 0.1)",
    blurFallback: "rgba(15, 20, 25, 0.26)",
    ringPrimary: "rgba(255, 107, 0, 0.1)",
    ringSecondary: "rgba(42, 47, 58, 0.4)",
    gridLine: "rgba(255, 255, 255, 0.02)",
    cardTint: "rgba(21, 26, 33, 0.76)",
  },
  light: {
    background: "#0f1419",
    card: "#151a21",
    cardBorder: "#2a2f3a",
    cardShadow: "#08111f",
    logo: "#ff6b00",
    title: "#f1ece4",
    subtitle: "#d0d9e7",
    label: "#93a9c5",
    input: "#293752",
    inputBorder: "#2f3f59",
    inputText: "#ffffff",
    placeholderText: "rgba(255, 255, 255, 0.42)",
    inputFocusBg: "rgba(255, 107, 0, 0.08)",
    inputFocusGlow: "rgba(255, 107, 0, 0.24)",
    toggleBg: "#162235",
    toggleBorder: "#2f3b4f",
    footer: "#87a0bf",
    buttonText: "#0d1420",
    errorBorder: "#7f1d1d",
    errorBg: "rgba(127, 29, 29, 0.22)",
    errorText: "#fecaca",
    blurOverlay: "rgba(15, 20, 25, 0.1)",
    blurFallback: "rgba(15, 20, 25, 0.26)",
    ringPrimary: "rgba(255, 107, 0, 0.1)",
    ringSecondary: "rgba(42, 47, 58, 0.4)",
    gridLine: "rgba(255, 255, 255, 0.02)",
    cardTint: "rgba(21, 26, 33, 0.76)",
  },
} as const;

type Palette = (typeof palettes)[keyof typeof palettes];

const GRID_SIZE = 44;

export function LoginScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { locale, setLocale, direction, t } = useLocale();
  const { isDark } = useTheme();
  const palette = isDark ? palettes.dark : palettes.light;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { login } = useSession();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const passwordInputRef = useRef<TextInput | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const outerPadding = width < 380 ? 13 : width < 768 ? 18 : 24;
  const cardMaxWidth = Math.min(Math.max(width * 0.88, 302), 420);
  const cardPaddingHorizontal = width < 360 ? 16 : width < 430 ? 18 : 22;
  const cardPaddingVertical = 18;
  const isRtl = direction === "rtl";
  const textAlign = getTextAlign(direction);
  const rowDirection = getRowDirection(direction);
  const verticalGridCount = Math.ceil(width / GRID_SIZE);
  const horizontalGridCount = Math.ceil(Dimensions.get("screen").height / GRID_SIZE) + 2;
  const scrollPaddingVertical = 38;
  const contentPaddingTop = scrollPaddingVertical + insets.top;
  const contentPaddingBottom = scrollPaddingVertical + Math.max(insets.bottom, 12) + keyboardInset;
  const shouldRenderBlurView = Platform.OS !== "web";
  const blurIntensity = Platform.OS === "android" ? 110 : 75;
  const actionTextColor = isDark ? "#e6e2dd" : "#0c0a09";

  const toggleLocale = async () => {
    await setLocale(locale === "en" ? "ar" : "en");
  };

  const syncInputValue =
    (setter: (value: string) => void) =>
    (event: NativeSyntheticEvent<TextInputChangeEventData>) => {
      setter(event.nativeEvent.text);
    };

  const moveCardIntoView = (extraOffset = 0) => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, contentPaddingTop - 18 + extraOffset),
        animated: true,
      });
    });
  };

  const handleFieldFocus = (field: "email" | "password") => {
    setFocusedField(field);
    moveCardIntoView();
  };

  const handleFieldBlur = (field: "email" | "password") => {
    setFocusedField((current) => (current === field ? null : current));
  };

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      const nextInset = Math.max(0, event.endCoordinates.height - insets.bottom);
      setKeyboardInset(nextInset);
      moveCardIntoView(Math.min(220, Math.round(nextInset * 0.4)));
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [contentPaddingTop, insets.bottom]);

  const handleSubmit = async () => {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await login({ email: email.trim(), password });
    } catch (currentError) {
      if (currentError instanceof AxiosError && currentError.response?.status === 401) {
        setError(t("login.invalidCredentials"));
      } else {
        setError(t("mobile.signInFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor="transparent"
        translucent
      />
      <View style={styles.backgroundBase} />
      <View style={styles.backgroundOverlay}>
        <View style={styles.ringPrimary} />
        <View style={styles.ringSecondary} />
      </View>
      {shouldRenderBlurView ? (
        <BlurView
          intensity={blurIntensity}
          tint="dark"
          blurReductionFactor={Platform.OS === "android" ? 1 : undefined}
          experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
          pointerEvents="none"
          style={styles.backgroundBlur}
        />
      ) : (
        <View pointerEvents="none" style={styles.backgroundBlurFallback} />
      )}

      <View pointerEvents="none" style={styles.gridOverlay}>
        {Array.from({ length: verticalGridCount }).map((_, index) => (
          <View
            key={`v-${index}`}
            style={[
              styles.verticalLine,
              {
                left: index * GRID_SIZE,
              },
            ]}
          />
        ))}

        {Array.from({ length: horizontalGridCount }).map((_, index) => (
          <View
            key={`h-${index}`}
            style={[
              styles.horizontalLine,
              {
                top: index * GRID_SIZE,
              },
            ]}
          />
        ))}
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardInset > 0 ? styles.scrollContentKeyboard : null,
            {
              paddingHorizontal: outerPadding,
              paddingTop: contentPaddingTop,
              paddingBottom: contentPaddingBottom,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces={false}
        >
          <View
            style={[
              styles.cardFrame,
              {
                width: "100%",
                maxWidth: cardMaxWidth,
              },
            ]}
          >
            <View
              style={[
                styles.card,
                {
                  paddingHorizontal: cardPaddingHorizontal,
                  paddingTop: cardPaddingVertical - 1,
                  paddingBottom: cardPaddingVertical,
                },
              ]}
            >
              <View style={styles.cardTint} />
              <View style={[styles.headerRow, { flexDirection: rowDirection }]}>
              <View style={[styles.brandRow, { flexDirection: rowDirection }]}>
                <View style={styles.logoBox}>
                  <FontAwesome5 name="dumbbell" size={12} color={palette.buttonText} />
                </View>

                <View>
                  <Text
                    style={[
                      styles.brandTitle,
                      {
                        fontFamily: resolveFontFamily(locale, "serif", "bold"),
                        textAlign,
                      },
                    ]}
                  >
                    {t("common.appName")}
                  </Text>
                  <Text
                    style={[
                      styles.brandSubtitle,
                      {
                        fontFamily: resolveFontFamily(locale, "mono", "bold"),
                        textAlign,
                      },
                    ]}
                  >
                    {locale === "ar" ? "نظام الإدارة" : t("common.managementSystem")}
                  </Text>
                </View>
              </View>

                <Pressable onPress={toggleLocale} style={styles.localeButton}>
                  <Text
                    style={[
                      styles.localeButtonText,
                      {
                        fontFamily: resolveFontFamily(locale, locale === "ar" ? "sans" : "mono", "bold"),
                      },
                    ]}
                  >
                    {locale === "en" ? "عربي" : "English"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.titleBlock}>
                <Text
                  style={[
                    styles.title,
                    {
                      fontFamily: resolveFontFamily(locale, "serif", "bold"),
                      textAlign,
                    },
                  ]}
                >
                  {t("login.title")}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    {
                      fontFamily: resolveFontFamily(locale, "sans", "regular"),
                      textAlign,
                    },
                  ]}
                >
                  {t("login.subtitle")}
                </Text>
              </View>

              <View style={styles.formBlock}>
                {error ? (
                  <View style={styles.errorBox}>
                    <Text
                      style={[
                        styles.errorText,
                        {
                          fontFamily: resolveFontFamily(locale, "sans", "medium"),
                          textAlign,
                        },
                      ]}
                    >
                      {error}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.fieldBlock}>
                  <Text
                    style={[
                      styles.label,
                      {
                        fontFamily: resolveFontFamily(locale, "mono", "bold"),
                        textAlign,
                      },
                    ]}
                  >
                    {t("login.email")}
                  </Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  importantForAutofill="yes"
                  placeholder={t("mobile.emailPlaceholder")}
                  placeholderTextColor={palette.placeholderText}
                  underlineColorAndroid="transparent"
                  cursorColor={palette.logo}
                  value={email}
                  onChangeText={setEmail}
                  onChange={syncInputValue(setEmail)}
                  onFocus={() => handleFieldFocus("email")}
                  onBlur={() => handleFieldBlur("email")}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  returnKeyType="next"
                  selectionColor={palette.logo}
                  style={[
                    styles.input,
                    focusedField === "email" ? styles.inputFocused : null,
                    {
                      fontFamily: resolveFontFamily(locale, "sans", "medium"),
                      textAlign,
                      borderColor: focusedField === "email" ? palette.logo : palette.inputBorder,
                    },
                  ]}
                />
              </View>

                <View style={styles.fieldBlock}>
                  <Text
                    style={[
                      styles.label,
                      {
                        fontFamily: resolveFontFamily(locale, "mono", "bold"),
                        textAlign,
                      },
                    ]}
                  >
                    {t("login.password")}
                  </Text>
                  <View style={styles.passwordShell}>
                  <TextInput
                    ref={passwordInputRef}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    textContentType="password"
                    importantForAutofill="yes"
                    placeholder={t("mobile.passwordPlaceholder")}
                    placeholderTextColor={palette.placeholderText}
                    underlineColorAndroid="transparent"
                    cursorColor={palette.logo}
                    value={password}
                    onChangeText={setPassword}
                    onChange={syncInputValue(setPassword)}
                    onFocus={() => handleFieldFocus("password")}
                    onBlur={() => handleFieldBlur("password")}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    selectionColor={palette.logo}
                    style={[
                      styles.passwordInput,
                      focusedField === "password" ? styles.inputFocused : null,
                      {
                        fontFamily: resolveFontFamily(locale, "sans", "medium"),
                        textAlign,
                        paddingLeft: isRtl ? 36 : 12,
                        paddingRight: isRtl ? 12 : 36,
                        borderColor: focusedField === "password" ? palette.logo : palette.inputBorder,
                      },
                    ]}
                  />
                    <Pressable
                      onPress={() => setShowPassword((current) => !current)}
                      style={[styles.eyeButton, isRtl ? styles.eyeButtonLeft : styles.eyeButtonRight]}
                    >
                      <Feather name={showPassword ? "eye-off" : "eye"} size={14} color="#94a3b8" />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.submitButtonRow}>
                  <Pressable
                    onPress={handleSubmit}
                    disabled={submitting}
                    style={styles.submitButton}
                  >
                    {submitting ? (
                      <ActivityIndicator color={actionTextColor} size="small" />
                    ) : (
                      <Text
                        style={[
                          styles.submitText,
                          {
                            color: actionTextColor,
                            fontFamily: resolveFontFamily(locale, "mono", "bold"),
                          },
                        ]}
                      >
                        {t("login.signIn")}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>

              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[
                  styles.footer,
                  {
                    fontFamily: resolveFontFamily(locale, "mono", "regular"),
                  },
                ]}
              >
                {t("login.footer")}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.background,
      overflow: "hidden",
    },
    backgroundBase: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: palette.background,
    },
    backgroundOverlay: {
      ...StyleSheet.absoluteFillObject,
      opacity: 1,
    },
    backgroundBlur: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: palette.blurOverlay,
      zIndex: 0,
    },
    backgroundBlurFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: palette.blurFallback,
      zIndex: 0,
    },
    gridOverlay: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.6,
      zIndex: 1,
    },
    ringPrimary: {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 620,
      height: 620,
      marginLeft: -310,
      marginTop: -310,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.ringPrimary,
    },
    ringSecondary: {
      position: "absolute",
      top: "50%",
      left: "50%",
      width: 760,
      height: 760,
      marginLeft: -380,
      marginTop: -380,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: palette.ringSecondary,
    },
    verticalLine: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 1,
      backgroundColor: palette.gridLine,
    },
    horizontalLine: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: palette.gridLine,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    scrollContentKeyboard: {
      justifyContent: "flex-start",
    },
    keyboardAvoider: {
      flex: 1,
      zIndex: 2,
    },
    cardFrame: {
      alignSelf: "center",
      shadowColor: palette.cardShadow,
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    card: {
      overflow: "hidden",
      borderRadius: 3,
      borderWidth: 1,
      borderColor: palette.cardBorder,
      backgroundColor: "transparent",
    },
    cardTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: palette.cardTint,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
    },
    logoBox: {
      width: 31,
      height: 31,
      borderRadius: 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.logo,
    },
    brandTitle: {
      color: palette.title,
      fontSize: 15,
      lineHeight: 17,
    },
    brandSubtitle: {
      marginTop: 2,
      color: palette.label,
      fontSize: 7.5,
      lineHeight: 9,
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    localeButton: {
      minWidth: 66,
      height: 27,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 2,
      borderWidth: 1,
      borderColor: palette.toggleBorder,
      backgroundColor: palette.toggleBg,
      paddingHorizontal: 10,
    },
    localeButtonText: {
      color: palette.title,
      fontSize: 9.5,
      lineHeight: 11,
    },
    titleBlock: {
      marginTop: 33,
    },
    title: {
      color: palette.title,
      fontSize: 17,
      lineHeight: 20,
    },
    subtitle: {
      marginTop: 7,
      color: palette.subtitle,
      fontSize: 12.5,
      lineHeight: 15,
    },
    formBlock: {
      marginTop: 27,
    },
    errorBox: {
      marginBottom: 14,
      borderWidth: 1,
      borderColor: palette.errorBorder,
      backgroundColor: palette.errorBg,
      borderRadius: 2,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    errorText: {
      color: palette.errorText,
      fontSize: 12,
      lineHeight: 15,
    },
    fieldBlock: {
      marginBottom: 15,
    },
    label: {
      marginBottom: 7,
      color: palette.label,
      fontSize: 9.5,
      lineHeight: 11,
      letterSpacing: 0.9,
    },
    input: {
      height: 33,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.input,
      color: palette.inputText,
      borderRadius: 1,
      paddingHorizontal: 12,
      paddingVertical: 0,
      fontSize: 12.5,
    },
    inputFocused: {
      backgroundColor: palette.inputFocusBg,
      borderWidth: 1.5,
      shadowColor: palette.inputFocusGlow,
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
      elevation: 2,
    },
    passwordShell: {
      position: "relative",
      justifyContent: "center",
    },
    passwordInput: {
      height: 33,
      borderWidth: 1,
      borderColor: palette.inputBorder,
      backgroundColor: palette.input,
      color: palette.inputText,
      borderRadius: 1,
      paddingVertical: 0,
      fontSize: 12.5,
    },
    eyeButton: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 30,
      alignItems: "center",
      justifyContent: "center",
    },
    eyeButtonRight: {
      right: 0,
    },
    eyeButtonLeft: {
      left: 0,
    },
    submitButton: {
      height: 40,
      width: "100%",
      borderRadius: 5,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.logo,
      borderWidth: 1,
      borderColor: palette.logo,
    },
    submitButtonRow: {
      marginTop: 4,
      width: "100%",
    },
    submitText: {
      color: palette.buttonText,
      fontSize: 11.5,
      lineHeight: 13,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    footer: {
      marginTop: 14,
      color: palette.footer,
      textAlign: "center",
      fontSize: 8.2,
      lineHeight: 10,
    },
  });
}
