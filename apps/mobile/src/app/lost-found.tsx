import * as DocumentPicker from "expo-document-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, Input, MediaPreview, MutedText, PrimaryButton, QueryState, Screen, SectionTitle, SecondaryButton, TextArea } from "@/components/ui";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";

type LostFoundComment = {
  id: string;
  text: string;
  created_at: string;
};

type LostFoundMedia = {
  id: string;
  media_url: string;
  media_mime: string;
};

type LostFoundItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  found_location?: string | null;
  category?: string | null;
  contact_note?: string | null;
  comments?: LostFoundComment[];
  media?: LostFoundMedia[];
};

export default function LostFoundScreen() {
  const { authorizedRequest } = useSession();
  const { copy, direction, fontSet, isRTL, theme } = usePreferences();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [foundLocation, setFoundLocation] = useState("");
  const [contactNote, setContactNote] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["mobile-lost-found"],
    queryFn: async () => (await authorizedRequest<LostFoundItem[]>("/mobile/customer/lost-found/items")).data,
  });
  const items = itemsQuery.data ?? [];
  const selectedItem = useMemo(() => items.find((item) => item.id === selectedItemId) ?? items[0] ?? null, [items, selectedItemId]);

  const itemDetailQuery = useQuery({
    queryKey: ["mobile-lost-found-detail", selectedItem?.id],
    enabled: Boolean(selectedItem?.id),
    queryFn: async () => (await authorizedRequest<LostFoundItem>(`/mobile/customer/lost-found/items/${selectedItem?.id}`)).data,
  });

  const createItemMutation = useMutation({
    mutationFn: async () =>
      authorizedRequest("/mobile/customer/lost-found/items", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          category,
          found_location: foundLocation || null,
          contact_note: contactNote || null,
        }),
      }),
    onSuccess: async (payload) => {
      setTitle("");
      setDescription("");
      setCategory("");
      setFoundLocation("");
      setContactNote("");
      setFeedback(copy.common.successUpdated);
      const data = payload.data as { id: string };
      setSelectedItemId(data.id);
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) {
        throw new Error(copy.lostFoundScreen.noItems);
      }
      return authorizedRequest(`/mobile/customer/lost-found/items/${selectedItem.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ text: comment }),
      });
    },
    onSuccess: async () => {
      setComment("");
      setFeedback(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found-detail", selectedItem?.id] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const mediaMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) {
        throw new Error(copy.lostFoundScreen.noItems);
      }
      const picked = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets[0]) {
        return null;
      }
      const asset = picked.assets[0];
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? "application/octet-stream",
      } as never);
      return authorizedRequest(`/mobile/customer/lost-found/items/${selectedItem.id}/media`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: async (payload) => {
      if (!payload) {
        return;
      }
      setFeedback(copy.common.successUpdated);
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found-detail", selectedItem?.id] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-lost-found"] });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : copy.common.errorTryAgain),
  });

  const detail = itemDetailQuery.data ?? selectedItem;

  return (
    <Screen title={copy.common.lostFound} subtitle={copy.lostFoundScreen.subtitle}>
      <Card>
        <SectionTitle>{copy.lostFoundScreen.createItem}</SectionTitle>
        <Input value={title} onChangeText={setTitle} placeholder={copy.lostFoundScreen.title} />
        <Input value={category} onChangeText={setCategory} placeholder={copy.lostFoundScreen.category} />
        <TextArea value={description} onChangeText={setDescription} placeholder={copy.lostFoundScreen.description} />
        <Input value={foundLocation} onChangeText={setFoundLocation} placeholder={copy.lostFoundScreen.foundLocation} />
        <Input value={contactNote} onChangeText={setContactNote} placeholder={copy.lostFoundScreen.contactNote} />
        <PrimaryButton onPress={() => createItemMutation.mutate()} disabled={createItemMutation.isPending || !title.trim() || !description.trim() || !category.trim()}>
          {createItemMutation.isPending ? copy.lostFoundScreen.createItemBusy : copy.lostFoundScreen.createItem}
        </PrimaryButton>
      </Card>

      <QueryState
        loading={itemsQuery.isLoading}
        error={itemsQuery.error instanceof Error ? itemsQuery.error.message : null}
        empty={!itemsQuery.isLoading && items.length === 0}
        emptyMessage={copy.lostFoundScreen.noItems}
      />

      {items.length > 0 ? (
        <>
          <Card>
            <SectionTitle>{copy.common.lostFound}</SectionTitle>
            {items.map((item) => {
              const active = detail?.id === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedItemId(item.id)}
                  style={[styles.itemRow, { borderTopColor: theme.border, backgroundColor: active ? theme.cardAlt : "transparent", borderColor: active ? theme.primary : theme.border }]}
                >
                  <View style={styles.itemHead}>
                    <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                      {item.title}
                    </Text>
                    <Text style={{ color: theme.primary, fontFamily: fontSet.mono, fontSize: 11, fontWeight: "800" }}>{item.status}</Text>
                  </View>
                  <MutedText>{item.category || "--"}</MutedText>
                </Pressable>
              );
            })}
          </Card>

          {detail ? (
            <Card>
              <SectionTitle>{detail.title}</SectionTitle>
              <MutedText>{detail.status}</MutedText>
              <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                {detail.description}
              </Text>
              <MutedText>{detail.found_location || copy.common.noLocationAdded}</MutedText>
              {detail.contact_note ? <MutedText>{detail.contact_note}</MutedText> : null}

              <SectionTitle>{copy.lostFoundScreen.media}</SectionTitle>
              {detail.media?.length ? detail.media.map((item) => (
                <MediaPreview key={item.id} uri={item.media_url} mime={item.media_mime} label={item.media_mime} />
              )) : <MutedText>{copy.common.noData}</MutedText>}
              <SecondaryButton onPress={() => mediaMutation.mutate()} disabled={mediaMutation.isPending}>
                {mediaMutation.isPending ? copy.common.uploading : copy.common.attachFile}
              </SecondaryButton>

              <SectionTitle>{copy.lostFoundScreen.itemComments}</SectionTitle>
              {detail.comments?.map((item) => (
                <View key={item.id} style={[styles.commentRow, { borderTopColor: theme.border, backgroundColor: theme.cardAlt }]}>
                  <Text style={{ color: theme.foreground, fontFamily: fontSet.body, textAlign: isRTL ? "right" : "left", writingDirection: direction }}>
                    {item.text}
                  </Text>
                  <MutedText>{new Date(item.created_at).toLocaleString(isRTL ? "ar" : "en")}</MutedText>
                </View>
              ))}
              <TextArea value={comment} onChangeText={setComment} placeholder={copy.lostFoundScreen.commentPlaceholder} />
              <PrimaryButton onPress={() => commentMutation.mutate()} disabled={commentMutation.isPending || !comment.trim()}>
                {commentMutation.isPending ? copy.lostFoundScreen.commentBusy : copy.lostFoundScreen.addComment}
              </PrimaryButton>
            </Card>
          ) : null}
        </>
      ) : null}

      {feedback ? (
        <Card>
          <MutedText>{feedback}</MutedText>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  itemRow: {
    gap: 4,
    borderTopWidth: 1,
    borderWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderRadius: 10,
  },
  itemHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  commentRow: {
    gap: 4,
    borderTopWidth: 1,
    paddingTop: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
});
