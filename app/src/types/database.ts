export type Database = {
  pfam: {
    Tables: {
      codeset: {
        Row: {
          cs_id: number;
          cs_name: string | null;
          cs_activeflag: string | null;
          cs_comment: string | null;
        };
        Insert: {
          cs_id: number;
          cs_name?: string | null;
          cs_activeflag?: string | null;
          cs_comment?: string | null;
        };
        Update: {
          cs_id?: number;
          cs_name?: string | null;
          cs_activeflag?: string | null;
          cs_comment?: string | null;
        };
      };
      codevalue: {
        Row: {
          cv_id: number;
          cs_id: number;
          cv_name: string;
          cv_order: number;
          cv_comment: string | null;
          cv_etc: string | null;
          cv_etc2: string | null;
          cv_etc3: string | null;
          cv_etc4: string | null;
          cv_etc5: string | null;
          cv_etc6: string | null;
          cv_etc7: string | null;
          cv_etc8: string | null;
          cv_etc9: string | null;
          cv_etc10: string | null;
        };
        Insert: {
          cv_id: number;
          cs_id: number;
          cv_name: string;
          cv_order: number;
          cv_comment?: string | null;
          cv_etc?: string | null;
          cv_etc2?: string | null;
          cv_etc3?: string | null;
          cv_etc4?: string | null;
          cv_etc5?: string | null;
          cv_etc6?: string | null;
          cv_etc7?: string | null;
          cv_etc8?: string | null;
          cv_etc9?: string | null;
          cv_etc10?: string | null;
        };
        Update: {
          cv_id?: number;
          cs_id?: number;
          cv_name?: string;
          cv_order?: number;
          cv_comment?: string | null;
          cv_etc?: string | null;
          cv_etc2?: string | null;
          cv_etc3?: string | null;
          cv_etc4?: string | null;
          cv_etc5?: string | null;
          cv_etc6?: string | null;
          cv_etc7?: string | null;
          cv_etc8?: string | null;
          cv_etc9?: string | null;
          cv_etc10?: string | null;
        };
      };
      organ: {
        Row: {
          org_id: number;
          org_sec_cd: number;
          org_name: string;
          reg_num: string;
          reg_date: string | null;
          post: string | null;
          addr: string | null;
          addr_detail: string | null;
          tel: string | null;
          fax: string | null;
          rep_name: string | null;
          acct_name: string | null;
          comm: string | null;
          userid: string | null;
          passwd: string | null;
          hint1: string | null;
          hint2: string | null;
          org_order: number | null;
          pre_acc_from: string | null;
          pre_acc_to: string | null;
          acc_from: string | null;
          acc_to: string | null;
          code_date: string | null;
        };
        Insert: Omit<Database["pfam"]["Tables"]["organ"]["Row"], "org_id"> & {
          org_id?: number;
        };
        Update: Partial<Database["pfam"]["Tables"]["organ"]["Row"]>;
      };
      customer: {
        Row: {
          cust_id: number;
          cust_sec_cd: number;
          reg_num: string | null;
          name: string | null;
          job: string | null;
          tel: string | null;
          sido: number | null;
          post: string | null;
          addr: string | null;
          addr_detail: string | null;
          fax: string | null;
          bigo: string | null;
          reg_date: string | null;
          cust_order: number | null;
        };
        Insert: {
          cust_id?: number;
          cust_sec_cd: number;
          reg_num?: string | null;
          name?: string | null;
          job?: string | null;
          tel?: string | null;
          sido?: number | null;
          post?: string | null;
          addr?: string | null;
          addr_detail?: string | null;
          fax?: string | null;
          bigo?: string | null;
          reg_date?: string | null;
          cust_order?: number | null;
        };
        Update: {
          cust_id?: number;
          cust_sec_cd?: number;
          reg_num?: string | null;
          name?: string | null;
          job?: string | null;
          tel?: string | null;
          sido?: number | null;
          post?: string | null;
          addr?: string | null;
          addr_detail?: string | null;
          fax?: string | null;
          bigo?: string | null;
          reg_date?: string | null;
          cust_order?: number | null;
        };
      };
      acc_book: {
        Row: {
          acc_book_id: number;
          org_id: number;
          incm_sec_cd: number;
          acc_sec_cd: number;
          item_sec_cd: number;
          exp_sec_cd: number;
          cust_id: number;
          acc_date: string;
          content: string;
          acc_amt: number;
          rcp_yn: string;
          rcp_no: string | null;
          rcp_no2: number | null;
          tel: string | null;
          post: string | null;
          addr: string | null;
          addr_detail: string | null;
          acc_sort_num: number | null;
          reg_date: string | null;
          acc_ins_type: string | null;
          acc_print_ok: string | null;
          bigo: string | null;
          bigo2: string | null;
          return_yn: string | null;
          exp_type_cd: number | null;
          exp_group1_cd: string | null;
          exp_group2_cd: string | null;
          exp_group3_cd: string | null;
        };
        Insert: Omit<Database["pfam"]["Tables"]["acc_book"]["Row"], "acc_book_id"> & {
          acc_book_id?: number;
        };
        Update: Partial<Database["pfam"]["Tables"]["acc_book"]["Row"]>;
      };
      acc_book_bak: {
        Row: {
          bak_id: number;
          work_kind: number;
          acc_book_id: number;
          org_id: number;
          incm_sec_cd: number;
          acc_sec_cd: number;
          item_sec_cd: number;
          exp_sec_cd: number;
          cust_id: number;
          acc_date: string;
          content: string;
          acc_amt: number;
          rcp_yn: string;
          rcp_no: string | null;
          rcp_no2: number | null;
          tel: string | null;
          post: string | null;
          addr: string | null;
          addr_detail: string | null;
          acc_sort_num: number | null;
          reg_date: string | null;
          acc_ins_type: string | null;
          acc_print_ok: string | null;
          bigo: string | null;
          bigo2: string | null;
          return_yn: string | null;
          exp_type_cd: number | null;
          exp_group1_cd: string | null;
          exp_group2_cd: string | null;
          exp_group3_cd: string | null;
        };
        Insert: Omit<Database["pfam"]["Tables"]["acc_book_bak"]["Row"], "bak_id"> & {
          bak_id?: number;
        };
        Update: Partial<Database["pfam"]["Tables"]["acc_book_bak"]["Row"]>;
      };
      evidence_file: {
        Row: {
          file_id: number;
          acc_book_id: number | null;
          org_id: number;
          file_name: string;
          file_type: string;
          storage_path: string;
          file_size: number;
          created_at: string;
        };
        Insert: Omit<Database["pfam"]["Tables"]["evidence_file"]["Row"], "file_id" | "created_at"> & {
          file_id?: number;
          created_at?: string;
        };
        Update: Partial<Database["pfam"]["Tables"]["evidence_file"]["Row"]>;
      };
      acc_rel: {
        Row: {
          acc_rel_id: number;
          org_sec_cd: number;
          incm_sec_cd: number;
          acc_sec_cd: number;
          item_sec_cd: number;
          exp_sec_cd: number;
          input_yn: string;
          acc_order: number;
        };
        Insert: Omit<Database["pfam"]["Tables"]["acc_rel"]["Row"], "acc_rel_id"> & {
          acc_rel_id?: number;
        };
        Update: Partial<Database["pfam"]["Tables"]["acc_rel"]["Row"]>;
      };
      estate: {
        Row: {
          estate_id: number;
          org_id: number;
          estate_sec_cd: number;
          kind: string;
          qty: number;
          content: string;
          amt: number;
          remark: string;
          reg_date: string | null;
          estate_order: number | null;
        };
        Insert: Omit<Database["pfam"]["Tables"]["estate"]["Row"], "estate_id"> & {
          estate_id?: number;
        };
        Update: Partial<Database["pfam"]["Tables"]["estate"]["Row"]>;
      };
      opinion: {
        Row: {
          org_id: number;
          acc_from: string | null;
          acc_to: string | null;
          audit_from: string | null;
          audit_to: string | null;
          opinion: string | null;
          print_01: string | null;
          position: string | null;
          addr: string | null;
          name: string | null;
          judge_from: string | null;
          judge_to: string | null;
          incm_from: string | null;
          incm_to: string | null;
          estate_amt: number | null;
          in_amt: number | null;
          cm_amt: number | null;
          balance_amt: number | null;
          print_02: string | null;
          comm_desc: string | null;
          comm_name01: string | null;
          comm_name02: string | null;
          comm_name03: string | null;
          comm_name04: string | null;
          comm_name05: string | null;
          acc_title: string | null;
          acc_docy: string | null;
          acc_docnum: string | null;
          acc_fdate: string | null;
          acc_comm: string | null;
          acc_torgnm: string | null;
          acc_borgnm: string | null;
          acc_repnm: string | null;
        };
        Insert: Database["pfam"]["Tables"]["opinion"]["Row"];
        Update: Partial<Database["pfam"]["Tables"]["opinion"]["Row"]>;
      };
      customer_addr: {
        Row: {
          cust_id: number;
          cust_seq: number;
          reg_date: string | null;
          tel: string | null;
          post: string | null;
          addr: string | null;
          addr_detail: string | null;
        };
        Insert: Database["pfam"]["Tables"]["customer_addr"]["Row"];
        Update: Partial<Database["pfam"]["Tables"]["customer_addr"]["Row"]>;
      };
      user_organ: {
        Row: {
          id: number;
          user_id: string;
          org_id: number;
          is_default: boolean | null;
          created_at: string | null;
        };
        Insert: Omit<Database["pfam"]["Tables"]["user_organ"]["Row"], "id" | "created_at"> & {
          id?: number;
          created_at?: string | null;
        };
        Update: Partial<Database["pfam"]["Tables"]["user_organ"]["Row"]>;
      };
      backup_history: {
        Row: {
          id: number;
          org_id: number;
          org_name: string | null;
          backup_type: string;
          file_path: string;
          file_size: number | null;
          created_at: string | null;
          created_by: string | null;
        };
        Insert: Omit<Database["pfam"]["Tables"]["backup_history"]["Row"], "id" | "created_at"> & {
          id?: number;
          created_at?: string | null;
        };
        Update: Partial<Database["pfam"]["Tables"]["backup_history"]["Row"]>;
      };
    };
    Functions: {
      calculate_balance: {
        Args: {
          p_org_id: number;
          p_acc_sec_cd?: number | null;
          p_date_from?: string | null;
          p_date_to?: string | null;
        };
        Returns: {
          income_total: number;
          expense_total: number;
          balance: number;
        }[];
      };
      export_org_data: {
        Args: { p_org_id: number };
        Returns: Record<string, unknown>;
      };
    };
  };
};
